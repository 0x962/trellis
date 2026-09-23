import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceCtx } from "../support.ts";
import { closeExitedAssignments } from "./closeExitedAssignments.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const at = new Date("2026-09-23T12:00:00Z");

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
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

async function seedRun(kind: "session" | "agent") {
	const id = ulid();
	const terminalId = crypto.randomUUID();
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_key,harness,terminal_id,created_at,updated_at)
		VALUES (${id},${`run-${id}`},${kind},'Do the work','',${JSON.stringify({ preset: "muse" })}::jsonb,
		${terminalId},${at},${at})`);
	return { id, terminalId };
}

function exitedSession(terminalId: string, error: string | null): RuntimeProcessStatus {
	return {
		id: terminalId,
		daemonId: "test",
		pid: null,
		mode: "pty",
		status: "exited",
		startedAt: at.toISOString(),
		endedAt: at.toISOString(),
		exitCode: 1,
		error: "Process /bin/node exited with code 1",
		checkedAt: at.toISOString(),
		elapsedMs: 0,
		controllable: false,
		process: null,
		launch: { command: "muse", args: [], cwd: "/nowhere" },
		agent: {
			sessionId: "session-1",
			model: null,
			turnId: null,
			tool: null,
			lastTool: null,
			lastMessage: null,
			error,
			outcome: error === null ? "completed" : "failed",
		},
		activity: null,
		acknowledgedMessageIds: [],
		result: null,
	};
}

const storedRun = (id: string) =>
	db.transaction(async (tx) => {
		const [run] = await rows<{ error: string | null; closed_at: Date | null }>(
			tx,
			sql`SELECT error, closed_at FROM agent_runs WHERE id=${id}`,
		);
		return run!;
	});

test("the reason a bridge gave outlives the execution service", async () => {
	const run = await seedRun("session");
	await closeExitedAssignments(ctx, async () => [
		exitedSession(run.terminalId, "A provider message requires text of at most 200000 characters"),
	]);
	expect((await storedRun(run.id)).error).toBe("A provider message requires text of at most 200000 characters");
});

// A ticket agent keeps its assignment after the process exits, so this run
// stays open. Its reason still belongs in the row.
test("an agent run keeps the reason and stays open", async () => {
	const run = await seedRun("agent");
	await closeExitedAssignments(ctx, async () => [exitedSession(run.terminalId, "Codex engine exited: 3")]);
	const stored = await storedRun(run.id);
	expect(stored.error).toBe("Codex engine exited: 3");
	expect(stored.closed_at).toBeNull();
});

test("a run that stopped with no reason keeps an empty error", async () => {
	const run = await seedRun("session");
	await closeExitedAssignments(ctx, async () => [exitedSession(run.terminalId, null)]);
	expect((await storedRun(run.id)).error).toBeNull();
});
