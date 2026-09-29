import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { AgentRunStartInputSchema, HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { reserve } from "./reserve.ts";

const harness = HarnessSchema.parse({ preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" });
const TICKETS = 12;
let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;

beforeAll(async () => {
	db = await openTestDb();
	const at = new Date();
	const projectId = ulid();
	const statusId = ulid();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,directory,created_at,updated_at)
		VALUES (${projectId},'TST','test','Test','/tmp/repository',${at},${at})`);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	for (let number = 1; number <= TICKETS; number++)
		await db.execute(sql`INSERT INTO tickets (id,project_id,number,title,status_id,position,created_at,updated_at)
			VALUES (${ulid()},${projectId},${number},${`Task ${number}`},${statusId},${number},${at},${at})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const actor = { name: "Test", kind: "human" as const };
	ctx = {
		actor,
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
});
afterAll(async () => {
	await db?.$client.close();
});

test("two starts of one ticket at the same time leave one open agent run", async () => {
	const results = await Promise.allSettled([
		db.transaction((tx) => reserve(ctx, tx, { ticket: "TST-1", harness })),
		db.transaction((tx) => reserve(ctx, tx, { ticket: "TST-1", harness })),
	]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(results.find((result) => result.status === "rejected")?.reason.code).toBe("DUPLICATE");
	const open = await db.execute(
		sql`SELECT id FROM agent_runs WHERE kind='agent' AND closed_at IS NULL AND ticket_identifier='TST-1'`,
	);
	expect(open.rows).toHaveLength(1);
});

test("two starts that carry one request id give one run", async () => {
	const input = AgentRunStartInputSchema.parse({
		ticket: "TST-2",
		harness,
		requestId: randomBytes(8192).toString("hex"),
	});
	const [first, second] = await Promise.all([
		db.transaction((tx) => reserve(ctx, tx, input)),
		db.transaction((tx) => reserve(ctx, tx, input)),
	]);
	expect(first.run.id).toBe(second.run.id);
	expect([first.replay, second.replay].filter(Boolean)).toHaveLength(1);
	const replay = await db.transaction((tx) => reserve(ctx, tx, input));
	expect(replay.replay).toBe(true);
	expect(replay.run.terminalId).toBe(first.run.terminalId);
});

test("a wave of ten tickets reserves ten runs", async () => {
	const batch = ulid();
	const reserved = await Promise.all(
		Array.from({ length: 10 }, (_, index) =>
			db.transaction((tx) => reserve(ctx, tx, { ticket: `TST-${index + 3}`, harness, requestId: `${batch}:${index}` })),
		),
	);
	expect(new Set(reserved.map((result) => result.run.id)).size).toBe(10);
});

test("two session starts that carry one request id give one run", async () => {
	const session = { name: "plan", instruction: "Read the source", fingerprint: "one-window" };
	const input = { project: "TST", harness, requestId: "one-session-click" };
	const [first, second] = await Promise.all([
		db.transaction((tx) => reserve(ctx, tx, input, [], { session })),
		db.transaction((tx) => reserve(ctx, tx, input, [], { session })),
	]);
	expect(first.run.id).toBe(second.run.id);
	expect([first.replay, second.replay].filter(Boolean)).toHaveLength(1);
	const runs = await db.execute(sql`SELECT id FROM agent_runs WHERE kind='session'`);
	expect(runs.rows).toHaveLength(1);
});

test("long request keys retain distinct suffixes and reject changed targets", async () => {
	const prefix = randomBytes(8192).toString("hex");
	const options = { session: { name: "long keys", instruction: "Read", fingerprint: "same" } };
	const input = { project: "TST", harness, requestId: `${prefix}a` };
	const first = await db.transaction((tx) => reserve(ctx, tx, input, [], options));
	const second = await db.transaction((tx) => reserve(ctx, tx, { ...input, requestId: `${prefix}b` }, [], options));
	expect(first.run.id).not.toBe(second.run.id);
	const replay = await db.transaction((tx) => reserve(ctx, tx, input, [], options));
	expect(replay.run.id).toBe(first.run.id);
	expect(replay.replay).toBe(true);
	await expect(
		db.transaction((tx) =>
			reserve(ctx, tx, input, [], {
				session: { ...options.session, fingerprint: "changed" },
			}),
		),
	).rejects.toThrow("different assignment");
});
