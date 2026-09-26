import type { AgentRunKind } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";

const at = new Date("2026-09-26T04:00:00.000Z");

const processOf = (
	id: string,
	options: {
		status?: "running" | "exited" | "unknown";
		activity?: "ready" | "working" | "idle";
		outcome?: "completed" | "interrupted" | "failed" | null;
		error?: string | null;
		stopReason?: "idle";
	} = {},
): RuntimeProcessStatus => ({
	id,
	daemonId: "test",
	pid: options.status === "exited" ? null : 42,
	mode: "pty",
	status: options.status ?? "running",
	stopReason: options.stopReason,
	startedAt: at.toISOString(),
	endedAt: options.status === "exited" ? at.toISOString() : null,
	exitCode: options.status === "exited" ? 0 : null,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: 1000,
	agent: {
		sessionId: `provider-${id}`,
		model: "test",
		turnId: `turn-${id}`,
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: options.error ?? null,
		outcome: options.outcome ?? null,
	},
	activity: { state: options.activity ?? "idle", updatedAt: at.toISOString() },
	acknowledgedMessageIds: [id],
	result: null,
	controllable: (options.status ?? "running") === "running",
	process: null,
	launch: { command: "agent", args: [], cwd: "/workspace" },
});

export async function broadcastFixture() {
	const db = await openTestDb();
	const ids = {
		workingAgent: ulid(),
		workingFlow: ulid(),
		idleAgent: ulid(),
		idleSession: ulid(),
		stopped: ulid(),
		failed: ulid(),
		archivedProject: ulid(),
		archivedSession: ulid(),
		closed: ulid(),
	};
	const terminals = Object.fromEntries(Object.keys(ids).map((key) => [key, crypto.randomUUID()])) as Record<
		keyof typeof ids,
		string
	>;
	const projects = { activeA: ulid(), activeB: ulid(), archived: ulid() };
	const statuses = { activeA: ulid(), activeB: ulid() };
	const epics = { activeA: ulid(), activeB: ulid() };
	const tickets = { activeA: ulid(), activeB: ulid() };
	const insertRun = async (input: {
		id: string;
		key: keyof typeof terminals;
		name: string;
		kind: AgentRunKind;
		projectId?: string;
		projectKey?: string;
		ticketId?: string;
		ticketIdentifier?: string;
		closed?: boolean;
	}) => {
		await db.execute(sql`INSERT INTO agent_runs (
			id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier,
			harness, terminal_id, session_id, closed_at, created_at, updated_at
		) VALUES (
			${input.id}, ${input.name}, ${input.kind}, 'Work', ${input.projectId ?? null}, ${input.projectKey ?? ""},
			${input.ticketId ?? null}, ${input.ticketIdentifier ?? null}, '{"preset":"claude"}'::jsonb,
			${terminals[input.key]}, ${`provider-${input.id}`}, ${input.closed ? at : null}, ${at}, ${at}
		)`);
	};

	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('qa', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at) VALUES
		(${projects.activeA}, 'ONE', 'one', 'One', NULL, ${at}, ${at}),
		(${projects.activeB}, 'TWO', 'two', 'Two', NULL, ${at}, ${at}),
		(${projects.archived}, 'OLD', 'old', 'Old', ${at}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES
		(${statuses.activeA}, ${projects.activeA}, 'Todo', 'todo', 'todo', 'gray', 0, true, ${at}, ${at}),
		(${statuses.activeB}, ${projects.activeB}, 'Todo', 'todo', 'todo', 'gray', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics (
		id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at
	) VALUES
		(${epics.activeA}, ${projects.activeA}, 'first-plan', 'First plan', 'qa', 'human', ${at}, ${at}),
		(${epics.activeB}, ${projects.activeB}, 'second-plan', 'Second plan', 'qa', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, epic_id, position, created_at, updated_at
	) VALUES
		(${tickets.activeA}, ${projects.activeA}, 1, 'First task', ${statuses.activeA}, ${epics.activeA}, 1024, ${at}, ${at}),
		(${tickets.activeB}, ${projects.activeB}, 2, 'Second task', ${statuses.activeB}, ${epics.activeB}, 1024, ${at}, ${at})`);

	await insertRun({
		id: ids.workingAgent,
		key: "workingAgent",
		name: "Working ticket agent",
		kind: "agent",
		projectId: projects.activeA,
		projectKey: "ONE",
		ticketId: tickets.activeA,
		ticketIdentifier: "ONE-1",
	});
	await insertRun({
		id: ids.workingFlow,
		key: "workingFlow",
		name: "Working flow agent",
		kind: "flow",
		projectId: projects.activeB,
		projectKey: "TWO",
		ticketId: tickets.activeB,
		ticketIdentifier: "TWO-2",
	});
	await insertRun({
		id: ids.idleAgent,
		key: "idleAgent",
		name: "Idle ticket agent",
		kind: "agent",
		projectId: projects.activeB,
		projectKey: "TWO",
		ticketId: tickets.activeB,
		ticketIdentifier: "TWO-2",
	});
	for (const input of [
		{ key: "idleSession", name: "Idle session", kind: "session" },
		{ key: "stopped", name: "Stopped", kind: "agent", projectId: projects.activeA, projectKey: "ONE" },
		{ key: "failed", name: "Failed", kind: "agent", projectId: projects.activeA, projectKey: "ONE" },
		{
			key: "archivedProject",
			name: "Archived project",
			kind: "agent",
			projectId: projects.archived,
			projectKey: "OLD",
		},
		{ key: "archivedSession", name: "Archived session", kind: "session" },
		{ key: "closed", name: "Closed", kind: "agent", projectId: projects.activeA, projectKey: "ONE", closed: true },
	] as const) {
		await insertRun({ ...input, id: ids[input.key] });
	}
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, archived_at, created_at, updated_at) VALUES
		(${ulid()}, 'Idle session', '/idle', '{"preset":"claude"}'::jsonb, ${ids.idleSession}, NULL, ${at}, ${at}),
		(${ulid()}, 'Archived session', '/archived', '{"preset":"claude"}'::jsonb, ${ids.archivedSession}, ${at}, ${at}, ${at})`);

	const initialProcesses: Array<[string, RuntimeProcessStatus]> = [
		[terminals.workingAgent, processOf(terminals.workingAgent, { activity: "working" })],
		[terminals.workingFlow, processOf(terminals.workingFlow, { activity: "working" })],
		[
			terminals.idleAgent,
			processOf(terminals.idleAgent, { status: "exited", outcome: "completed", stopReason: "idle" }),
		],
		[terminals.idleSession, processOf(terminals.idleSession, { outcome: "completed" })],
		[terminals.stopped, processOf(terminals.stopped, { status: "exited", outcome: "completed" })],
		[terminals.failed, processOf(terminals.failed, { activity: "working", error: "Provider failed" })],
		[terminals.archivedProject, processOf(terminals.archivedProject, { activity: "working" })],
		[terminals.archivedSession, processOf(terminals.archivedSession, { activity: "working" })],
		[terminals.closed, processOf(terminals.closed, { activity: "working" })],
	];
	const processes = new Map(initialProcesses);
	const resetProcesses = () => {
		processes.clear();
		for (const [id, process] of initialProcesses) processes.set(id, process);
	};
	const read = async (_home: string, input: { ids?: string[] }) =>
		(input.ids ?? []).flatMap((id) => {
			const process = processes.get(id);
			return process === undefined ? [] : [process];
		});
	const inTx = <T>(action: (tx: Tx) => Promise<T>) => db.transaction(action);
	const ctx = {
		actor: { kind: "human", name: "qa" },
		session: null,
		home: "/nowhere",
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => at,
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		emit: () => {},
		afterCommit: () => {},
		newTx: inTx,
		vacuum: async () => {},
		core: {} as IoCtx["core"],
		localUrl: "http://127.0.0.1:4521",
		publicUrl: "http://127.0.0.1:4521",
		background: () => {},
	} satisfies IoCtx;

	return { close: () => db.$client.close(), ctx, ids, processOf, processes, read, resetProcesses, terminals };
}
