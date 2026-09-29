import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
	ReviewApplySchema,
	ReviewBodySchema,
	ReviewCreateSchema,
	ReviewSubmitSchema,
	type ReviewThread,
} from "@trellis/api";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import type { PrepareCtx, ServiceCtx } from "../../support.ts";
import { applyResult, prepareApply } from "../apply.ts";
import { edit } from "../messages.ts";
import { readThread } from "../queries.ts";
import { submit } from "../remote.ts";
import { show } from "../submissions.ts";
import { add, reply } from "../threads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const ctx = {
	actor: { name: "reviewer", kind: "human" },
	session: null,
	now: () => new Date("2026-09-29T20:00:00Z"),
	emit: () => {},
	newTx: run,
} as unknown as ServiceCtx;
const headSha = "a".repeat(40);

beforeAll(async () => {
	db = await openTestDb();
});
afterAll(async () => {
	await db.$client.close();
});

test("saves and rereads complete comments, replies, edits, and a long path", async () => {
	const body = `${"界".repeat(200_001)}\nlast comment line`;
	const path = `${"directory/".repeat(500)}file.ts`;
	const thread = await run((tx) => add(ctx, tx, ReviewCreateSchema.parse({ pr: "acme/app#1", path, line: 1, body })));
	const replyBody = `${body}\nlast reply line`;
	const replied = await run((tx) => reply(ctx, tx, { id: thread.id, body: ReviewBodySchema.parse(replyBody) }));
	const saved = await run((tx) => readThread(tx, thread.id));
	expect(saved.body).toBe(body);
	expect(saved.path).toBe(path);
	expect(saved.replies[0]?.body).toBe(replyBody);
	const editedBody = `${body}\nlast edited line`;
	await run((tx) =>
		edit(ctx, tx, { id: replied.replies[0]!.id, body: ReviewBodySchema.parse(editedBody), expectedVersion: 1 }),
	);
	const edited = await run((tx) => readThread(tx, thread.id));
	expect(edited.replies[0]?.body).toBe(editedBody);
	expect(edited.replies[0]?.version).toBe(2);
	await expect(
		run((tx) => edit(ctx, tx, { id: replied.replies[0]!.id, body: "stale edit", expectedVersion: 1 })),
	).rejects.toMatchObject({ code: "REVIEW_VERSION_CONFLICT" });
});

test("saves all 201 selected threads with the complete verdict", async () => {
	const pr = "acme/app#2";
	const threads = await run(async (tx) => {
		const found: ReviewThread[] = [];
		for (let index = 0; index < 201; index++)
			found.push(
				await add(
					ctx,
					tx,
					ReviewCreateSchema.parse({ pr, path: "file.ts", line: index + 1, body: `Comment ${index}` }),
				),
			);
		return found;
	});
	const body = `${"a".repeat(200_001)}\nlast verdict line`;
	const threadIds = threads.map((thread) => thread.id);
	const result = await run((tx) =>
		submit(ctx, tx, ReviewSubmitSchema.parse({ pr, headSha, verdict: "request_changes", body, threadIds })),
	);
	const saved = await run((tx) => show(ctx, tx, { id: result.submission.id }));
	expect(saved.body).toBe(body);
	expect(saved.threads.map((thread) => thread.id)).toEqual(threadIds);
	expect(saved.threads.at(-1)?.body).toBe("Comment 200");
	const foreign = await run((tx) =>
		add(ctx, tx, ReviewCreateSchema.parse({ pr: "acme/other#2", path: "file.ts", line: 1, body: "Other PR" })),
	);
	await expect(
		run((tx) =>
			submit(
				ctx,
				tx,
				ReviewSubmitSchema.parse({ pr, headSha, verdict: "approve", threadIds: [...threadIds, foreign.id] }),
			),
		),
	).rejects.toThrow("belongs to another pull request");
});

test("applies 51 suggestions and 10001 original lines with the complete commit message", async () => {
	const pr = "acme/app#3";
	const original = Array.from({ length: 10_001 }, (_, index) => `original ${index}`);
	const tail = Array.from({ length: 50 }, (_, index) => `tail ${index}`);
	const threads = await run(async (tx) => {
		const first = await add(
			ctx,
			tx,
			ReviewCreateSchema.parse({
				pr,
				path: "file.ts",
				startLine: 1,
				line: original.length,
				original,
				body: "```suggestion\nreplacement\n```",
			}),
		);
		const found = [first];
		for (let index = 0; index < tail.length; index++)
			found.push(
				await add(
					ctx,
					tx,
					ReviewCreateSchema.parse({
						pr,
						path: "file.ts",
						line: original.length + index + 1,
						original: [tail[index]],
						body: `\`\`\`suggestion\nchanged ${index}\n\`\`\``,
					}),
				),
			);
		return found;
	});
	const saved = await run((tx) => readThread(tx, threads[0]!.id));
	expect(saved.suggestion?.original).toEqual(original);
	const calls: string[][] = [];
	const message = `Complete suggestions\n\n${"界".repeat(10_001)}\nlast message line`;
	let requestFile = "";
	const gh = Object.assign(
		async (_slot: string, args: string[]) => {
			calls.push(args);
			let stdout: string;
			if (args[0] === "pr") {
				stdout = JSON.stringify({ state: "OPEN", headRefOid: headSha, headRefName: "feature" });
			} else if (args[1] === "graphql") {
				requestFile = args.at(-1)!;
				await Bun.sleep(20);
				const request = JSON.parse(await readFile(requestFile, "utf8"));
				const input = request.variables.input;
				expect(input.expectedHeadOid).toBe(headSha);
				expect(`${input.message.headline}\n\n${input.message.body}`).toBe(
					`${message}\n\nSuggested in Trellis review by reviewer.`,
				);
				expect(input.fileChanges.additions).toHaveLength(1);
				expect(Buffer.from(input.fileChanges.additions[0].contents, "base64").toString()).toBe(
					`${["replacement", ...tail.map((_, index) => `changed ${index}`)].join("\n")}\n`,
				);
				stdout = JSON.stringify({
					data: {
						createCommitOnBranch: { commit: { oid: "new-sha", url: "https://github.com/acme/app/commit/new-sha" } },
					},
				});
			} else {
				stdout = `${[...original, ...tail].join("\n")}\n`;
			}
			return { ok: true as const, code: 0, stdout, stderr: "" };
		},
		{ bin: "gh", timeoutMs: 30_000 },
	);
	const prepared = await prepareApply(
		{ ...ctx, gh } as PrepareCtx,
		ReviewApplySchema.parse({ pr, headSha, message, threadIds: threads.map((thread) => thread.id) }),
	);
	const applied = await run((tx) => applyResult(ctx, tx, prepared));
	expect(calls.filter((args) => args[1] === "graphql")).toHaveLength(1);
	expect(applied.threads).toHaveLength(51);
	expect(
		applied.threads.every((thread) => thread.status === "resolved" && thread.suggestion?.appliedSha === "new-sha"),
	).toBe(true);
	expect((await run((tx) => readThread(tx, threads.at(-1)!.id))).suggestion?.state).toBe("applied");
	expect(await Bun.file(requestFile).exists()).toBe(false);
});
