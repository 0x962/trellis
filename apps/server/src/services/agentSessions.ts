import {
	type AgentBatchRecord,
	type AgentRole,
	type AgentRunner,
	type AgentSession,
	type AgentState,
	pickAgentPersonName,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import type { Runner } from "../agents/runner.ts";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";

// What an agents service receives: the core context, the runner, and
// `newTx`. A `prepare` step runs with no transaction open, so it reads and
// writes through `newTx` in short transactions of its own while the runner
// works. `afterCommit` queues work for after the commit, and
// `settingsChanged` tells the agents host that the agent settings changed.
// `batches` gives the batches the dispatcher sent, newest first.
export type AgentsCtx = ServiceCtx & {
	runner: Runner;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	afterCommit: (task: () => Promise<void>) => void;
	settingsChanged: () => void;
	batches: () => AgentBatchRecord[];
};

// The states in which an agent holds its terminal. A builder in one of them
// counts toward the limit of its project.
export const LIVE_STATES = sql.raw(`('starting', 'running', 'waiting')`);

// Ids from one process sort in creation order, also inside one millisecond,
// so a list ordered by (created_at, id) is the order of the starts.
export const newSessionId = monotonicFactory();

// The wire session plus the Claude session id, which only the runner reads.
export type SessionRow = AgentSession & { claudeSessionId: string | null };

type RawSession = {
	id: string;
	project_id: string;
	ticket_id: string | null;
	role: AgentRole;
	runner: AgentRunner;
	state: AgentState;
	workspace_id: string | null;
	terminal_id: string | null;
	claude_session_id: string | null;
	name: string;
	title: string;
	open_url: string | null;
	last_woken_at: string | null;
	error: string | null;
	created_at: string;
};

const columns = sql`s.id, s.project_id, s.ticket_id, s.role, s.runner, s.state, s.workspace_id, s.terminal_id,
	s.claude_session_id, s.name, s.title, s.open_url, ${iso(sql`s.last_woken_at`)} AS last_woken_at, s.error,
	${iso(sql`s.created_at`)} AS created_at`;

const toRow = (raw: RawSession): SessionRow => ({
	id: raw.id,
	projectId: raw.project_id,
	ticketId: raw.ticket_id,
	role: raw.role,
	runner: raw.runner,
	state: raw.state,
	workspaceId: raw.workspace_id,
	terminalId: raw.terminal_id,
	claudeSessionId: raw.claude_session_id,
	name: raw.name,
	title: raw.title,
	openUrl: raw.open_url,
	lastWokenAt: raw.last_woken_at,
	error: raw.error,
	createdAt: raw.created_at,
});

export const toSession = (row: SessionRow): AgentSession => ({
	id: row.id,
	projectId: row.projectId,
	ticketId: row.ticketId,
	role: row.role,
	runner: row.runner,
	state: row.state,
	workspaceId: row.workspaceId,
	terminalId: row.terminalId,
	name: row.name,
	title: row.title,
	openUrl: row.openUrl,
	lastWokenAt: row.lastWokenAt,
	error: row.error,
	createdAt: row.createdAt,
});

// The sessions `where` selects on the alias `s`, oldest first.
export const selectSessions = async (tx: Tx, where: SQL) =>
	(
		await rows<RawSession>(tx, sql`SELECT ${columns} FROM agent_sessions s WHERE ${where} ORDER BY s.created_at, s.id`)
	).map(toRow);

export const sessionById = async (tx: Tx, id: string) => {
	const [found] = await selectSessions(tx, sql`s.id = ${id}`);
	if (found === undefined) throw fail("NOT_FOUND", { kind: "agentSession", ref: id });
	return found;
};

// The person name for a new agent of `projectId`. A person calls a running
// agent by its name, so the answer is none of the names that the live
// agents of the project hold. The read and the insert of the name belong
// to one transaction, so two starts at the same time take two names.
export const reserveName = async (tx: Tx, projectId: string): Promise<string> => {
	const taken = await rows<{ name: string }>(
		tx,
		sql`SELECT name FROM agent_sessions WHERE project_id = ${projectId} AND state IN ${LIVE_STATES}`,
	);
	return pickAgentPersonName(taken.map((row) => row.name));
};

export type SessionInsert = {
	id: string;
	projectId: string;
	ticketId: string | null;
	role: AgentRole;
	state: AgentState;
	workspaceId: string | null;
	terminalId: string | null;
	claudeSessionId: string | null;
	name: string;
	title: string;
	openUrl: string | null;
	error?: string;
};

export const insertSession = (ctx: ServiceCtx, tx: Tx, row: SessionInsert) =>
	tx.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, workspace_id, terminal_id,
			claude_session_id, name, title, open_url, error, created_at, updated_at)
		VALUES (${row.id}, ${row.projectId}, ${row.ticketId}, ${row.role}, 'superset', ${row.state}, ${row.workspaceId},
			${row.terminalId}, ${row.claudeSessionId}, ${row.name}, ${row.title}, ${row.openUrl}, ${row.error ?? null},
			${ctx.now}, ${ctx.now})
	`);

// The newest manager of a project that trellis did not stop and whose
// terminal the runner reported.
export const managerOf = async (tx: Tx, projectId: string) =>
	(
		await selectSessions(
			tx,
			sql`s.project_id = ${projectId} AND s.role = 'manager' AND s.state <> 'stopped'
				AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`,
		)
	).at(-1);

// Sets the session to `failed` with what the runner said, and announces it.
export const failSession = async (ctx: ServiceCtx, tx: Tx, id: string, message: string) => {
	await tx.execute(
		sql`UPDATE agent_sessions SET state = 'failed', error = ${message}, updated_at = ${ctx.now} WHERE id = ${id}`,
	);
	return announce(ctx, tx, id);
};

// Reads the session as the transaction holds it, queues agents.session for
// it, and returns it. Every write to a session ends here, so the web sees
// each change.
export const announce = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const session = toSession(await sessionById(tx, id));
	ctx.emit({ type: "agents.session", session });
	return session;
};
