import type { AgentRunListInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { ServiceCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { openAgentRuns, storedColumns } from "./queries.ts";
import type { StoredRun } from "./types.ts";

type Ctx = ServiceCtx & { core: CoreCtx };

// A caller that names `ids` or `ticket` asks for a bounded set already, so
// the window can only hide a row that this caller wants.
const windowCondition = (input: AgentRunListInput, ticketId: string | null, now: Date) => {
	if (input.ids !== undefined || ticketId !== null) return sql`true`;
	const start = new Date(now.getTime() - input.windowHours * 3_600_000);
	return sql`(closed_at IS NULL OR created_at >= ${start})`;
};

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	// An agent run stays open until a person removes its assignment, so an
	// open run is usually older than the closed runs of the last day. The
	// sort puts the open runs first, so the limit only drops closed history
	// and never hides a run that a ticket or a session still holds.
	return rows<StoredRun>(
		tx,
		sql`SELECT ${storedColumns} FROM agent_runs WHERE
		${
			project === null
				? sql`true`
				: sql`((ticket_id IS NULL AND project_id = ${project.id}) OR
					ticket_id IN (SELECT id FROM tickets WHERE project_id = ${project.id}))`
		} AND
		${ticket === null ? sql`true` : sql`ticket_id = ${ticket.id}`} AND
		${
			input.ids === undefined
				? sql`true`
				: input.ids.length === 0
					? sql`false`
					: sql`id IN (${sql.join(
							input.ids.map((id) => sql`${id}`),
							sql`, `,
						)})`
		} AND
		${input.assigned === undefined ? sql`true` : input.assigned ? sql`closed_at IS NULL` : sql`closed_at IS NOT NULL`} AND
		${windowCondition(input, ticket === null ? null : ticket.id, ctx.now)}
		ORDER BY (closed_at IS NULL) DESC, created_at DESC, id DESC LIMIT ${input.limit}`,
	);
};

export const prepareList = async (ctx: Ctx, input: AgentRunListInput) =>
	observeRuns(ctx, await ctx.newTx((tx) => list(ctx.core, tx, input)));

// `needsYou` and the statistics faults read this set to decide something, so
// it takes no bound from the list route.
export const prepareOpenAgentRuns = async (ctx: Ctx) => observeRuns(ctx, await ctx.newTx(openAgentRuns));
