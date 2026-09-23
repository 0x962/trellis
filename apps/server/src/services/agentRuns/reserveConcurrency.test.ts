import { afterAll, beforeAll, expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { reserve } from "./reserve.ts";

const harness = HarnessSchema.parse({ preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" });
const TICKETS = 12;
let db: Awaited<ReturnType<typeof openTestDb>>;
let core: Parameters<typeof reserve>[0];

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
	core = {
		actor,
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	} as unknown as Parameters<typeof reserve>[0];
});
afterAll(async () => {
	await db?.$client.close();
});

test("two starts of one ticket at the same time leave one open agent run", async () => {
	const results = await Promise.allSettled([
		db.transaction((tx) => reserve(core, tx, { ticket: "TST-1", harness })),
		db.transaction((tx) => reserve(core, tx, { ticket: "TST-1", harness })),
	]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(results.find((result) => result.status === "rejected")?.reason.code).toBe("DUPLICATE");
	const open = await db.execute(
		sql`SELECT id FROM agent_runs WHERE kind='agent' AND closed_at IS NULL AND ticket_identifier='TST-1'`,
	);
	expect(open.rows).toHaveLength(1);
});

test("two starts that carry one request id give one run", async () => {
	const input = { ticket: "TST-2", harness, requestId: "one-click" };
	const [first, second] = await Promise.all([
		db.transaction((tx) => reserve(core, tx, input)),
		db.transaction((tx) => reserve(core, tx, input)),
	]);
	expect(first.run.id).toBe(second.run.id);
	expect([first.replay, second.replay].filter(Boolean)).toHaveLength(1);
});

test("a wave of ten tickets reserves ten runs", async () => {
	const batch = ulid();
	const reserved = await Promise.all(
		Array.from({ length: 10 }, (_, index) =>
			db.transaction((tx) =>
				reserve(core, tx, { ticket: `TST-${index + 3}`, harness, requestId: `${batch}:${index}` }),
			),
		),
	);
	expect(new Set(reserved.map((result) => result.run.id)).size).toBe(10);
});
