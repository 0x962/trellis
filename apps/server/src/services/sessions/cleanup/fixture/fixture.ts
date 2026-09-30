import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_DAY_MS, type SessionCleanup, type TrellisEvent } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../../../db/testDb.ts";
import { context } from "../../../sessionObservers/testFixture/testFixture.ts";
import { set } from "../../../settings";
import type { IoCtx } from "../../../support.ts";
import { createSessionRepository } from "../../directory.ts";
import { listSessions } from "../../queries.ts";
import { cleanup } from "../cleanup.ts";
import { removeCleanDirectory } from "../removeCleanDirectory";

export async function fixture() {
	const db = await openTestDb();
	const home = await mkdtemp(join(tmpdir(), "trellis-trl1264-cleanup-"));
	let now = new Date("2026-09-30T12:00:00.000Z");
	const events: TrellisEvent[] = [];
	const logs: unknown[] = [];
	const core = context(events, now);
	const ctx = {
		core,
		home,
		actor: core.actor!,
		now: () => now,
		newTx: (fn) => db.transaction(fn),
		emit: core.emit,
		log: (...args) => {
			logs.push(args);
		},
	} as IoCtx;
	const processes = new Map<string, RuntimeProcessStatus>();
	const removedObservers: string[] = [];
	const deps = {
		process: async (_ctx: unknown, id: string | null) => (id === null ? null : (processes.get(id) ?? null)),
		removeObserver: async (_ctx: unknown, input: { sourceRunId: string }) => {
			removedObservers.push(input.sourceRunId);
		},
		removeDirectory: removeCleanDirectory,
		openPaths: async (): Promise<string[]> => [],
	};
	const add = async (
		age: number,
		options: { terminal?: boolean; pinned?: boolean; project?: string; kind?: "agent" | "flow" | "session" } = {},
	) => {
		const id = ulid();
		const runId = ulid();
		const terminalId = options.terminal ? crypto.randomUUID() : null;
		const at = new Date(now.getTime() - age * SESSION_DAY_MS);
		const directory = join(home, "sessions", id);
		await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, harness, terminal_id, pinned_at, activity_at, created_at, updated_at)
			VALUES (${runId}, ${id}, ${options.kind ?? "session"}, 'Work.', ${options.project ?? null}, '', '{"preset":"codex"}'::jsonb, ${terminalId}, ${options.pinned ? now : null}, ${at}, ${at}, ${at})`);
		if (!options.kind || options.kind === "session") {
			await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
				VALUES (${id}, ${id}, ${directory}, '{"preset":"codex"}'::jsonb, ${runId}, ${at}, ${at})`);
			await createSessionRepository(directory);
		}
		return { id, runId, terminalId, directory, at };
	};
	return {
		db,
		ctx,
		home,
		add,
		events,
		logs,
		processes,
		deps,
		removedObservers,
		run: () => cleanup(ctx, {}, deps),
		list: () => db.transaction((tx) => listSessions(tx)),
		policy: (sessionCleanup: SessionCleanup) => db.transaction((tx) => set(core, tx, { sessionCleanup })),
		advance: (days: number) => {
			now = new Date(now.getTime() + days * SESSION_DAY_MS);
		},
		close: async () => {
			try {
				await db.$client.close();
			} finally {
				await rm(home, { recursive: true, force: true });
			}
		},
	};
}

export const processStatus = (
	id: string,
	status: "running" | "exited" | "unknown",
	at: Date,
): RuntimeProcessStatus => ({
	id,
	status,
	daemonId: "test",
	pid: null,
	mode: "pty",
	stopReason: "idle",
	startedAt: at.toISOString(),
	endedAt: status === "exited" ? at.toISOString() : null,
	exitCode: 0,
	error: null,
	checkedAt: new Date().toISOString(),
	elapsedMs: 0,
	controllable: status === "running",
	process: null,
	launch: { command: "codex", args: [], cwd: "/unused" },
	agent: null,
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
});
