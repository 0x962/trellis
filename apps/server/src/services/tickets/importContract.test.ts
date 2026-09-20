import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createEpic } from "../epics/epics.ts";
import { setContract } from "./contract.ts";
import { create } from "./create.ts";
import { importContract } from "./importContract.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'CON', 'con', 'Contract', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true,
			'2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "Test" } satisfies ActorRef,
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-20T10:01:00Z"),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	await run((tx) => createEpic(ctx, tx, { project: "CON", name: "First epic" }));
}, 30_000);

afterAll(async () => db.$client.close());

test("the import reads inline values and multi-line lists without changing the descriptions", async () => {
	const listedDescription = [
		"The ticket asks for a change.",
		"",
		"Files:",
		"",
		"- `one.ts`",
		"- two.ts",
		"",
		"#### VERIFY:",
		"`bun test one`",
		"bun test two",
		"",
		"**Review focus:**",
		"- The first rule stays true.",
		"- The second rule stays true.",
	].join("\n");
	const listed = await run((tx) =>
		create(ctx, tx, { project: "CON", epic: "CON/first-epic", title: "Listed", description: listedDescription }),
	);
	const inlineDescription =
		"files: one.ts and its test.\n- two.ts\n\nVerify: `bun test one`\n\nReview focus: The value stays exact.";
	const inline = await run((tx) =>
		create(ctx, tx, { project: "CON", epic: "CON/first-epic", title: "Inline", description: inlineDescription }),
	);

	expect(await run((tx) => importContract(ctx, tx, { epic: "CON/first-epic" }))).toEqual({
		filledCount: 6,
		unresolved: [],
	});
	expect(await run((tx) => ticketGet(tx, listed.id))).toMatchObject({
		description: listedDescription,
		contract: {
			files: ["one.ts", "two.ts"],
			verify: ["bun test one", "bun test two"],
			reviewFocus: ["The first rule stays true.", "The second rule stays true."],
		},
	});
	expect(await run((tx) => ticketGet(tx, inline.id))).toMatchObject({
		description: inlineDescription,
		contract: {
			files: ["one.ts and its test.", "two.ts"],
			verify: ["bun test one"],
			reviewFocus: ["The value stays exact."],
		},
	});
});

test("the import keeps filled fields, reports unreadable lines, and changes nothing on a second run", async () => {
	const ticket = await run((tx) =>
		create(ctx, tx, {
			project: "CON",
			epic: "CON/first-epic",
			title: "Existing",
			description: "Files:\none.ts\n\nVerify: ``\n\nReview focus: Read the boundary.",
		}),
	);
	const existing = await run((tx) =>
		setContract(ctx, tx, {
			ticket: ticket.identifier,
			result: "Keep this result.",
			files: ["kept.ts"],
			leaveAlone: ["fixed.ts"],
			verify: ["bun test kept"],
			reviewFocus: [],
		}),
	);
	const first = await run((tx) => importContract(ctx, tx, { epic: "CON/first-epic" }));
	expect(first).toEqual({
		filledCount: 1,
		unresolved: [
			{ ticket: ticket.identifier, line: "one.ts" },
			{ ticket: ticket.identifier, line: "Verify: ``" },
		],
	});
	const afterFirst = await run((tx) => ticketGet(tx, ticket.id));
	expect(afterFirst.contract).toEqual({ ...existing.contract, reviewFocus: ["Read the boundary."] });
	const repeated = await run((tx) => importContract(ctx, tx, { epic: "CON/first-epic" }));
	expect(repeated).toEqual({
		filledCount: 0,
		unresolved: [
			{ ticket: ticket.identifier, line: "one.ts" },
			{ ticket: ticket.identifier, line: "Verify: ``" },
		],
	});
	expect((await run((tx) => ticketGet(tx, ticket.id))).version).toBe(afterFirst.version);
});
