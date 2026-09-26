import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { node } from "../../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createFlow } from "../flows/flows.ts";
import { save as saveFlow } from "../flows/save.ts";
import { ensurePr } from "../reviews/queries.ts";
import { create as createTicket } from "../tickets/create.ts";
import { start } from "./start.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const oneId = ulid();
const twoId = ulid();
const at = "2026-09-22T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const addProject = async (id: string, key: string, slug: string) => {
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
};

beforeAll(async () => {
	db = await openTestDb();
	await addProject(oneId, "ONE", "one");
	await addProject(twoId, "TWO", "two");
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "agent", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("a flow of another project cannot run on this ticket", async () => {
	const flow = await run((tx) => createFlow(ctx, tx, { name: "Two review", project: "TWO" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Work in project one" }));

	await expect(
		run((tx) =>
			start(ctx, tx, {
				flow: flow.slug,
				ticket: ticket.identifier,
				requestId: crypto.randomUUID(),
				expectedVersion: flow.version,
			}),
		),
	).rejects.toThrow("The flow belongs to another project.");
});

const fixture = async () => {
	const flow = await run((tx) => createFlow(ctx, tx, { name: `Review ${ulid()}`, project: "ONE" }));
	const doc = await run((tx) =>
		saveFlow(ctx, tx, {
			flow: flow.id,
			expectedVersion: flow.version,
			nodes: [node(ulid(), "agent", null)],
			edges: [],
		}),
	);
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Review this change" }));
	const diff = await run((tx) => ensurePr(tx, `example/app#${ticket.number}`));
	await db.execute(
		sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at) VALUES (${ticket.id},${diff.id},'manual','Test','agent',${at})`,
	);
	const input = {
		flow: flow.id,
		ticket: ticket.id,
		diffId: diff.id,
		headSha: "first",
		expectedVersion: doc.flow.version,
	};
	const create = (actor = "Test") =>
		run((tx) =>
			start({ ...ctx, actor: { kind: "agent", name: actor } }, tx, { ...input, requestId: crypto.randomUUID() }),
		);
	return { input, create };
};

test("concurrent agents receive one run for the same flow and diff", async () => {
	const { create } = await fixture();
	const [first, second] = await Promise.all([create(), create("Peer")]);
	expect(first.id).toBe(second.id);
});

test("only the latest execution error permits another automatic start", async () => {
	const { create } = await fixture();
	const first = await create();
	await db.execute(
		sql`UPDATE flow_executions SET state=${JSON.stringify({ ...first.state, status: "failed", failureKind: "error", error: "Provider exited" })}::jsonb WHERE id=${first.id}`,
	);
	const retry = await create();
	expect(retry.id).not.toBe(first.id);
	expect(retry.repeatOf).toBe(first.id);
	expect((await create()).id).toBe(retry.id);
});

for (const status of ["succeeded", "waiting", "canceled", "failed"] as const) {
	test(`${status} with feedback does not create another run after a push`, async () => {
		const { input, create } = await fixture();
		const first = await create();
		await db.execute(
			sql`UPDATE flow_executions SET state=${JSON.stringify({ ...first.state, status, ...(status === "failed" ? { failureKind: "feedback" } : {}), steps: first.state.steps.map((step) => ({ ...step, output: "Changes requested: fix the bug." })) })}::jsonb WHERE id=${first.id}`,
		);
		const again = await run((tx) => start(ctx, tx, { ...input, headSha: "second", requestId: crypto.randomUUID() }));
		expect(again.id).toBe(first.id);
	});
}

test("an explicit repeat records the user's reason and preserves request idempotency", async () => {
	const { input, create } = await fixture();
	const first = await create();
	const request = {
		...input,
		allowRepeat: true,
		repeatReason: "The user requested another review.",
		requestId: crypto.randomUUID(),
	};
	const repeated = await run((tx) => start(ctx, tx, request));
	expect(repeated.id).not.toBe(first.id);
	expect(repeated.repeatReason).toBe(request.repeatReason);
	expect((await run((tx) => start(ctx, tx, request))).id).toBe(repeated.id);
});
