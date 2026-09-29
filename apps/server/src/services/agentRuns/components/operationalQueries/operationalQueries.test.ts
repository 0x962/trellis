import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../../db/testDb.ts";
import type { Tx } from "../../../../db/tx.ts";
import { listUnresolvedAttempts } from "../../agentRuns.ts";
import { openAgentRuns, unresolvedAttemptRuns } from "./operationalQueries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-29T12:00:00.000Z");
const closedRun = "01C00000000000000000000000";
const failedRun = "01F00000000000000000000000";
const failedTerminal = "failed-terminal";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, runtime, closed_at, created_at, updated_at)
		SELECT '01R' || lpad(n::text, 23, '0'), 'open-' || n, 'agent', 'Work', '', 'native', NULL, ${at}, ${at}
		FROM generate_series(1, 1005) AS n`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, runtime, terminal_id, closed_at, created_at, updated_at) VALUES
		(${closedRun}, 'closed', 'agent', 'Work', '', 'native', NULL, ${at}, ${at}, ${at}),
		(${failedRun}, 'failed', 'agent', 'Work', '', 'native', ${failedTerminal}, ${at}, ${at}, ${at})`);
}, 30_000);

afterAll(async () => db.$client.close());

test("the operational query reads every open agent and excludes closed agents", async () => {
	const rows = await run(openAgentRuns);

	expect(rows).toHaveLength(1005);
	expect(rows.some((row) => row.id === closedRun || row.id === failedRun)).toBeFalse();
});

test("the unresolved query reads every open agent and an observed closed failure", async () => {
	const process: RuntimeProcessStatus = {
		id: failedTerminal,
		daemonId: "test",
		pid: null,
		mode: "pty",
		status: "exited",
		startedAt: at.toISOString(),
		endedAt: at.toISOString(),
		exitCode: 1,
		error: null,
		checkedAt: at.toISOString(),
		elapsedMs: 1000,
		agent: {
			sessionId: "provider-session",
			model: "test",
			turnId: "turn",
			tool: null,
			lastTool: null,
			lastMessage: null,
			error: "Provider failed.",
			outcome: "failed",
		},
		activity: { state: "idle", updatedAt: at.toISOString() },
		acknowledgedMessageIds: [failedTerminal],
		result: null,
		controllable: false,
		process: null,
		launch: null,
	};
	const candidates = await run((tx) => unresolvedAttemptRuns(tx, [failedTerminal]));
	const unresolved = await run((tx) =>
		listUnresolvedAttempts(tx, { sessions: [process], home: "/tmp/trellis-operational-queries" }),
	);

	expect(candidates).toHaveLength(1006);
	expect(candidates.some((row) => row.id === failedRun)).toBeTrue();
	expect(candidates.some((row) => row.id === closedRun)).toBeFalse();
	expect(unresolved).toHaveLength(1006);
	expect(unresolved.find((row) => row.id === failedRun)).toEqual({
		id: failedRun,
		state: "failed",
		error: "Provider failed.",
	});
});
