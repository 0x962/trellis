import { afterEach } from "bun:test";
import type {
	HarnessEvent,
	RuntimeHarnessActivityItem,
	RuntimeHarnessActivitySignal,
	RuntimeHarnessObservation,
	RuntimeOutput,
} from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";

const databases: Awaited<ReturnType<typeof openTestDb>>[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});

export const line = (value: RuntimeHarnessObservation) => Buffer.from(`${JSON.stringify(value)}\n`);
export const annotated = (
	event: HarnessEvent,
	fields: { activity?: RuntimeHarnessActivityItem; signal?: RuntimeHarnessActivitySignal },
): RuntimeHarnessObservation => ({
	observedAt: "2026-09-29T12:00:00.000Z",
	event,
	activityVersion: 1,
	...fields,
});

export const outputReader =
	(logs: Map<string, Buffer>, chunkSize = 19) =>
	async (attemptId: string, offset: number) => {
		const log = logs.get(attemptId);
		if (log === undefined) throw Object.assign(new Error("Session not found"), { code: "SESSION_NOT_FOUND" });
		const startOffset = Math.min(offset, log.length);
		const bytes = log.subarray(startOffset, Math.min(startOffset + chunkSize, log.length));
		return {
			data: bytes.toString("base64"),
			startOffset,
			nextOffset: startOffset + bytes.length,
			truncated: false,
		} satisfies RuntimeOutput;
	};

export const fixture = async () => {
	const db = await openTestDb();
	databases.push(db);
	const runId = ulid();
	const observerRunId = ulid();
	const attempts = [crypto.randomUUID(), crypto.randomUUID()];
	const observerAttempt = crypto.randomUUID();
	const at = new Date("2026-09-29T12:00:00.000Z");
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, terminal_id, created_at, updated_at) VALUES
		(${runId}, 'Worker', 'session', 'Work.', '', ${attempts[1]}, ${at}, ${at}),
		(${observerRunId}, 'Observer', 'session', 'Observe.', '', ${observerAttempt}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts
		(id, run_id, generation, token_hash, created_at) VALUES
		(${attempts[0]}, ${runId}, 1, 'one', ${at}),
		(${attempts[1]}, ${runId}, 2, 'two', ${at}),
		(${observerAttempt}, ${observerRunId}, 1, 'observer', ${at})`);
	const context = {
		home: "/tmp/session-observer-activity-test",
		newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn),
	};
	return { db, runId, observerRunId, attempts, observerAttempt, context, at };
};
