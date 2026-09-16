import { sql } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { notFound } from "../support.ts";
import { dispatchColumns } from "./controller.ts";
import { record } from "./nextActions/record.ts";
import type { Dispatch, WorkOutcome } from "./types.ts";

export const handle = async (
	ctx: Pick<RequestContext, "actor" | "now">,
	tx: Tx,
	input: { id: string; generation: number; outcomes: WorkOutcome[] },
) => {
	const [dispatch] = await rows<Dispatch>(
		tx,
		sql`SELECT ${dispatchColumns} FROM manager_dispatches WHERE id=${input.id}`,
	);
	if (!dispatch) throw notFound("managerDispatch", input.id);
	if (ctx.actor?.kind === "agent") {
		const [owner] = await rows<{ id: string }>(
			tx,
			sql`SELECT id FROM agent_runs WHERE id=${ctx.actor.name}
			AND project_id=${dispatch.projectId} AND kind='manager' AND closed_at IS NULL`,
		);
		if (!owner) throw invalidInput("actor", "Only this project's current manager can handle its dispatches.");
	} else if (ctx.actor?.kind !== "human") throw invalidInput("actor", "Use the project manager or a human actor.");
	if (input.generation !== dispatch.generation)
		throw invalidInput("generation", "Read the current dispatch generation before recording its outcome.");
	if (!["sending", "sent", "unknown"].includes(dispatch.state))
		throw invalidInput("id", "The manager has not received this dispatch.");
	const tickets = new Set<string | null>([
		...dispatch.events.map((event) => event.ticketId),
		...dispatch.nextActions.map((action) => action.ticketId),
	]);
	if (!tickets.size) tickets.add(null);
	const outcomes = new Map(dispatch.outcomes.map((outcome) => [outcome.ticketId, outcome]));
	for (const outcome of input.outcomes) {
		if (!tickets.has(outcome.ticketId)) throw invalidInput("outcomes", "Each outcome must belong to this dispatch.");
		const previous = outcomes.get(outcome.ticketId);
		if (
			previous &&
			(previous.status !== outcome.status ||
				previous.reason !== outcome.reason ||
				previous.reference !== outcome.reference)
		)
			throw invalidInput("outcomes", "This ticket already has a recorded outcome for this dispatch.");
		if (!previous) await record(ctx, tx, { dispatch, outcome });
		outcomes.set(outcome.ticketId, outcome);
	}
	const handled = [...tickets].every((ticketId) => outcomes.has(ticketId));
	const [result] = await rows<Dispatch>(
		tx,
		sql`UPDATE manager_dispatches SET state='sent', error=NULL, outcomes=${JSON.stringify([...outcomes.values()])}::jsonb,
		work_state=${handled ? "handled" : "open"}, handled_at=${handled ? sql`COALESCE(handled_at, ${ctx.now})` : sql`NULL`}
		WHERE id=${input.id} RETURNING ${dispatchColumns}`,
	);
	return result!;
};
