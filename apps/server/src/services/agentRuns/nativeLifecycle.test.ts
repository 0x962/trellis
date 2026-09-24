import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceCtx } from "../support.ts";
import { refreshNative } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";

// `refreshNative` carries the same rule as `closeExitedAssignments`: a run
// that a ticket or a session holds keeps its assignment when its process
// ends, and a flow run closes with its process.
let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const at = new Date("2026-09-24T21:00:00Z");

const seed = async (kind: "session" | "agent" | "flow") => {
	const id = ulid();
	const terminalId = crypto.randomUUID();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, harness, terminal_id, created_at, updated_at)
		VALUES (${id}, ${`run-${id}`}, ${kind}, 'Work', '', '{"preset":"claude"}'::jsonb, ${terminalId}, ${at}, ${at})`);
	return { id, terminalId };
};

// A process that ended for a reason other than idleness.
const exited = (terminalId: string): RuntimeProcessStatus => ({
	id: terminalId,
	daemonId: "test",
	pid: null,
	mode: "pty",
	status: "exited",
	startedAt: at.toISOString(),
	endedAt: at.toISOString(),
	exitCode: 0,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: 0,
	controllable: false,
	process: null,
	launch: { command: "claude", args: [], cwd: "/nowhere" },
	agent: null,
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
});

const closedAt = async (id: string) =>
	(
		await db.transaction((tx) =>
			rows<{ closed_at: Date | null }>(tx, sql`SELECT closed_at FROM agent_runs WHERE id = ${id}`),
		)
	)[0]!.closed_at;

beforeAll(async () => {
	db = await openTestDb();
	ctx = {
		home: "/nowhere",
		actor: { kind: "human", name: "qa" },
		session: null,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		vacuum: async () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
	};
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("a refresh keeps the assignment of a session whose process ended", async () => {
	const seeded = await seed("session");
	const run = await db.transaction((tx) => getRun(tx, seeded.id));

	await refreshNative(ctx, run, async () => exited(seeded.terminalId));

	expect(await closedAt(seeded.id)).toBeNull();
});

test("a refresh keeps the assignment of a ticket agent whose process ended", async () => {
	const seeded = await seed("agent");
	const run = await db.transaction((tx) => getRun(tx, seeded.id));

	await refreshNative(ctx, run, async () => exited(seeded.terminalId));

	expect(await closedAt(seeded.id)).toBeNull();
});

test("a refresh closes a flow run whose process ended", async () => {
	const seeded = await seed("flow");
	const run = await db.transaction((tx) => getRun(tx, seeded.id));

	await refreshNative(ctx, run, async () => exited(seeded.terminalId));

	expect(await closedAt(seeded.id)).not.toBeNull();
});
