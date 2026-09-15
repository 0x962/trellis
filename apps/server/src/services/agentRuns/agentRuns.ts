import type { AgentRun, AgentRunListInput, AgentRunStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { ServiceCtx } from "../support.ts";
import { startNative } from "./nativeStart.ts";
import { columns, getRun } from "./queries.ts";
import { reserve } from "./reserve.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	return rows<AgentRun>(
		tx,
		sql`SELECT ${columns} FROM agent_runs WHERE
		${ticket === null ? sql`true` : sql`ticket_id = ${ticket.id}`} AND
		${project === null ? sql`true` : sql`project_id = ${project.id}`} ORDER BY created_at DESC, id DESC`,
	);
};

export const prepareStart = async (ctx: Ctx, input: AgentRunStartInput) => {
	const reservation = await ctx.newTx((tx) => reserve(ctx.core, tx, input));
	if (reservation.replay) return { id: reservation.run.id };
	const { run, context, config, resume, attempt } = reservation;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return startNative(ctx, { run, context, config, resume, attempt });
};

export const finish = async (ctx: Ctx, tx: Tx, input: { id: string }) => {
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return getRun(tx, input.id);
};
