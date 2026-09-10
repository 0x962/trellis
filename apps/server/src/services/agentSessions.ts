import type { AgentBlockedReason, AgentRole, AgentRunner, AgentSession, AgentState } from "@trellis/api";
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
export type AgentsCtx = ServiceCtx & {
	runner: Runner;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	afterCommit: (task: () => Promise<void>) => void;
	settingsChanged: () => void;
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
	title: string;
	open_url: string | null;
	blocked_reason: AgentBlockedReason | null;
	blocked_path: string | null;
	blocked_detail: string | null;
	blocked_at: string | null;
	last_woken_at: string | null;
	created_at: string;
};

const columns = sql`s.id, s.project_id, s.ticket_id, s.role, s.runner, s.state, s.workspace_id, s.terminal_id,
	s.claude_session_id, s.title, s.open_url, s.blocked_reason, s.blocked_path, s.blocked_detail,
	${iso(sql`s.blocked_at`)} AS blocked_at, ${iso(sql`s.last_woken_at`)} AS last_woken_at,
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
	title: raw.title,
	openUrl: raw.open_url,
	blocked:
		raw.blocked_reason === null
			? null
			: { reason: raw.blocked_reason, path: raw.blocked_path, detail: raw.blocked_detail, at: raw.blocked_at! },
	lastWokenAt: raw.last_woken_at,
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
	title: row.title,
	openUrl: row.openUrl,
	blocked: row.blocked,
	lastWokenAt: row.lastWokenAt,
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

export type SessionInsert = {
	id: string;
	projectId: string;
	ticketId: string | null;
	role: AgentRole;
	state: AgentState;
	workspaceId: string | null;
	terminalId: string | null;
	claudeSessionId: string | null;
	title: string;
	openUrl: string | null;
};

export const insertSession = (ctx: ServiceCtx, tx: Tx, row: SessionInsert) =>
	tx.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, workspace_id, terminal_id,
			claude_session_id, title, open_url, created_at, updated_at)
		VALUES (${row.id}, ${row.projectId}, ${row.ticketId}, ${row.role}, 'superset', ${row.state}, ${row.workspaceId},
			${row.terminalId}, ${row.claudeSessionId}, ${row.title}, ${row.openUrl}, ${ctx.now}, ${ctx.now})
	`);

// What stops one agent from working. `path` is the folder a human trusts
// to clear a `folder-trust` block, and null for every other reason.
export type Block = { reason: AgentBlockedReason; path?: string; detail?: string };

// Records why one agent cannot work. The web reads it from the session and
// offers the one action that clears it.
export const blockSession = (ctx: ServiceCtx, tx: Tx, id: string, block: Block) =>
	tx.execute(sql`
		UPDATE agent_sessions SET blocked_reason = ${block.reason}, blocked_path = ${block.path ?? null},
			blocked_detail = ${block.detail ?? null}, blocked_at = ${ctx.now}, updated_at = ${ctx.now}
		WHERE id = ${id}
	`);

// Clears the block of one agent. Every start and every register runs it,
// so a session that works again shows nothing.
export const clearBlock = (ctx: ServiceCtx, tx: Tx, id: string) =>
	tx.execute(sql`
		UPDATE agent_sessions SET blocked_reason = NULL, blocked_path = NULL, blocked_detail = NULL, blocked_at = NULL,
			updated_at = ${ctx.now}
		WHERE id = ${id} AND blocked_reason IS NOT NULL
	`);

// Reads the session as the transaction holds it, queues agents.session for
// it, and returns it. Every write to a session ends here, so the web sees
// each change.
export const announce = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const session = toSession(await sessionById(tx, id));
	ctx.emit({ type: "agents.session", session });
	return session;
};
