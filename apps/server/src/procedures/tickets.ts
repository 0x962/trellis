import type { Ticket } from "@trellis/api";
import { call, os, setLocation, withIfMatch } from "./base.ts";

export const tickets = os.tickets.router({
	list: os.tickets.list.handler(({ context, input }) => call(context, "tickets.list", input)),
	counts: os.tickets.counts.handler(({ context, input }) => call(context, "tickets.counts", input)),
	board: os.tickets.board.handler(({ context, input }) => call(context, "tickets.board", input)),
	get: os.tickets.get.handler(({ context, input }) => call(context, "tickets.get", input)),
	create: os.tickets.create.handler(async ({ context, input }) => {
		const ticket = await call<Ticket>(context, "tickets.create", input);
		setLocation(context, `/api/tickets/${ticket.identifier}`);
		return ticket;
	}),
	update: os.tickets.update.handler(({ context, input }) =>
		call(context, "tickets.update", withIfMatch(context, input)),
	),
	move: os.tickets.move.handler(({ context, input }) => call(context, "tickets.move", withIfMatch(context, input))),
	updateMany: os.tickets.updateMany.handler(({ context, input }) => call(context, "tickets.updateMany", input)),
	deleteMany: os.tickets.deleteMany.handler(({ context, input }) => call(context, "tickets.deleteMany", input)),
	delete: os.tickets.delete.handler(({ context, input }) => call(context, "tickets.delete", input)),
	importDependencies: os.tickets.importDependencies.handler(({ context, input }) =>
		call(context, "tickets.importDependencies", input),
	),
	updateDependencies: os.tickets.updateDependencies.handler(({ context, input }) =>
		call(context, "tickets.updateDependencies", withIfMatch(context, input)),
	),
	setContract: os.tickets.setContract.handler(({ context, input }) =>
		call(context, "tickets.setContract", withIfMatch(context, input)),
	),
	setOutcome: os.tickets.setOutcome.handler(({ context, input }) =>
		call(context, "tickets.setOutcome", withIfMatch(context, input)),
	),
});
