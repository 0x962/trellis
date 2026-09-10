import type { AgentFailure, AgentRole, AgentRunner, AgentSession, AgentState, RunnerReason } from "@trellis/api";
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

// The wire session plus the two fields only the server reads: the Claude
// session the runner resumes, and the pull request a failed reviewer start
// runs again on.
export type SessionRow = AgentSession & { claudeSessionId: string | null; prUrl: string | null };

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
	pr_url: string | null;
	failure_reason: RunnerReason | null;
	failure_exit_code: number | null;
	failure_detail: string | null;
	last_woken_at: string | null;
	created_at: string;
};

const columns = sql`s.id, s.project_id, s.ticket_id, s.role, s.runner, s.state, s.workspace_id, s.terminal_id,
	s.claude_session_id, s.title, s.open_url, s.pr_url, s.failure_reason, s.failure_exit_code, s.failure_detail,
	${iso(sql`s.last_woken_at`)} AS last_woken_at, ${iso(sql`s.created_at`)} AS created_at`;

// The database keeps the three failure columns together: `failure_reason`
// is set for a row in the `failed` state and null for every other row.
const toFailure = (raw: RawSession): AgentFailure | null =>
	raw.failure_reason === null
		? null
		: { reason: raw.failure_reason, exitCode: raw.failure_exit_code, detail: raw.failure_detail ?? "" };

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
	prUrl: raw.pr_url,
	failure: toFailure(raw),
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
	failure: row.failure,
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
	prUrl?: string | null;
	failure?: AgentFailure | null;
};

export const insertSession = (ctx: ServiceCtx, tx: Tx, row: SessionInsert) => {
	const failure = row.failure ?? null;
	return tx.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, workspace_id, terminal_id,
			claude_session_id, title, open_url, pr_url, failure_reason, failure_exit_code, failure_detail,
			created_at, updated_at)
		VALUES (${row.id}, ${row.projectId}, ${row.ticketId}, ${row.role}, 'superset', ${row.state}, ${row.workspaceId},
			${row.terminalId}, ${row.claudeSessionId}, ${row.title}, ${row.openUrl}, ${row.prUrl ?? null},
			${failure?.reason ?? null}, ${failure?.exitCode ?? null}, ${failure?.detail ?? null}, ${ctx.now}, ${ctx.now})
	`);
};

// The three failure columns of a row whose start the runner refused. Every
// write that records a failure sets all three together, so the CHECK that
// pairs the `failed` state with a reason holds.
export const failureColumns = (failure: AgentFailure) =>
	sql`state = 'failed', failure_reason = ${failure.reason}, failure_exit_code = ${failure.exitCode},
		failure_detail = ${failure.detail}`;

// The same three columns emptied, for a start that worked.
export const clearedFailure = sql`failure_reason = NULL, failure_exit_code = NULL, failure_detail = NULL`;

// Reads the session as the transaction holds it, queues agents.session for
// it, and returns it. Every write to a session ends here, so the web sees
// each change.
export const announce = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const session = toSession(await sessionById(tx, id));
	ctx.emit({ type: "agents.session", session });
	return session;
};
