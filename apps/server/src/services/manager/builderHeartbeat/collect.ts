import { sql } from "drizzle-orm";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { readySession } from "../../controller/readySession.ts";
import type { ManagerCtx, ManagerInput } from "../types.ts";

export type BuilderHeartbeatCandidate = {
	runId: string;
	terminalId: string;
	sessionId: string | null;
	ticketId: string;
	projectId: string;
	activityState: string;
	activityAt: string;
};

export const collect = async (ctx: ManagerCtx, tx: Tx, input: ManagerInput) => {
	const ready = input.sessions.filter(readySession).map((session) => ({
		id: session.id,
		activityState: session.activity!.state,
		activityAt: session.activity!.updatedAt,
	}));
	if (ready.length === 0) return [];
	const quietBefore = new Date(ctx.now.getTime() - 120_000);
	return rows<BuilderHeartbeatCandidate>(
		tx,
		sql`SELECT r.id AS "runId", r.terminal_id AS "terminalId", r.session_id AS "sessionId",
			r.ticket_id AS "ticketId", r.project_id AS "projectId",
			live."activityState", ${iso(sql`live."activityAt"`)} AS "activityAt"
		FROM agent_runs r
		JOIN tickets t ON t.id = r.ticket_id
		JOIN statuses s ON s.id = t.status_id AND s.category = 'started'
		JOIN projects p ON p.id = r.project_id
		JOIN jsonb_to_recordset(${JSON.stringify(ready)}::jsonb)
			AS live(id text, "activityState" text, "activityAt" timestamptz) ON live.id = r.terminal_id
		LEFT JOIN builder_heartbeats h ON h.run_id = r.id
		WHERE r.kind = 'builder' AND r.runtime = 'native' AND r.closed_at IS NULL
		AND p.archived_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		AND live."activityAt" < ${quietBefore}
		AND (h.sent_at IS NULL OR h.sent_at < ${quietBefore})
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=p.id
			UNION ALL SELECT parent.id,parent.parent_id,parent.archived_at FROM projects parent JOIN ancestors child ON parent.id=child.parent_id
		) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
		ORDER BY r.created_at, r.id LIMIT 20`,
	);
};

export type BuilderHeartbeatContext = {
	ticket: { identifier: string; title: string; statusName: string; statusCategory: string };
	inProgress: { count: number; limit: number | null };
	comments: { id: string; body: string; actorKind: string; actorDisplayName: string | null; createdAt: string }[];
};

export const heartbeatContext = async (
	tx: Tx,
	candidate: Pick<BuilderHeartbeatCandidate, "ticketId">,
): Promise<BuilderHeartbeatContext> => {
	const [ticket] = await rows<BuilderHeartbeatContext["ticket"]>(
		tx,
		sql`SELECT root.key || '-' || t.number AS identifier, t.title, s.name AS "statusName", s.category AS "statusCategory"
		FROM tickets t JOIN statuses s ON s.id = t.status_id JOIN projects root ON root.id = t.root_id WHERE t.id = ${candidate.ticketId}`,
	);
	const [fill] = await rows<{ count: number; limit: number | null }>(
		tx,
		sql`SELECT (SELECT count(*)::int FROM tickets WHERE status_id = t.status_id) AS count, s.wip_limit AS "limit"
		FROM tickets t JOIN statuses s ON s.id = t.status_id WHERE t.id = ${candidate.ticketId}`,
	);
	const comments = await rows<BuilderHeartbeatContext["comments"][number]>(
		tx,
		sql`SELECT c.id, c.body, c.actor_kind AS "actorKind", r.persona_name AS "actorDisplayName",
			${iso(sql`c.created_at`)} AS "createdAt"
		FROM comments c LEFT JOIN agent_runs r ON c.actor_kind = 'agent' AND r.id = c.actor_name
		WHERE c.ticket_id = ${candidate.ticketId} ORDER BY c.created_at DESC, c.id DESC LIMIT 5`,
	);
	return { ticket: ticket!, inProgress: fill!, comments: comments.reverse() };
};

export const recordHeartbeat = async (ctx: ManagerCtx, tx: Tx, runId: string) => {
	await tx.execute(
		sql`INSERT INTO builder_heartbeats (run_id, sent_at) VALUES (${runId}, ${ctx.now})
		ON CONFLICT (run_id) DO UPDATE SET sent_at = ${ctx.now}`,
	);
};
