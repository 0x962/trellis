import { TicketGetInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import { ticketDependencies } from "../../../db/queries/ticketDependencies";
import type { Tx } from "../../../db/tx.ts";
import { resolveTicket } from "../../refs.ts";

export const dependencies = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = TicketGetInputSchema.parse(rawInput);
	const ticket = await resolveTicket(ctx, tx, input.ticket);
	return ticketDependencies(tx, ticket.id);
};
