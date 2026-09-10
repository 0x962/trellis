import type { AgentsOverview } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import type { Tx } from "../db/tx.ts";
import { activityColumns, type RawActivity, toActivity } from "./agentInbox.ts";
import { type AgentsCtx, selectSessions, toSession } from "./agentSessions.ts";

// The overview holds this many agent actions.
const ACTIONS_MAX = 50;

// Every session, the newest actions of the manager, builder, and reviewer
// agents that trellis runs, and the batches the dispatcher sent. An agent
// that trellis runs writes as `agent:<role>-<project or ticket>`.
export const overview = async (ctx: AgentsCtx, tx: Tx): Promise<AgentsOverview> => {
	const actions = (
		await rows<RawActivity>(
			tx,
			sql`SELECT ${activityColumns} FROM activity a
				WHERE a.actor_kind = 'agent' AND a.actor_name ~ '^(manager|builder|reviewer)-'
				ORDER BY a.id DESC LIMIT ${ACTIONS_MAX}`,
		)
	).map(toActivity);
	const ticketIds = [...new Set(actions.flatMap((action) => (action.ticketId === null ? [] : [action.ticketId])))];
	return {
		sessions: (await selectSessions(tx, sql`TRUE`)).map(toSession),
		actions,
		tickets: (await ticketSummaries(tx, ticketIds)).map(({ id, identifier }) => ({ id, identifier })),
		batches: ctx.batches(),
	};
};
