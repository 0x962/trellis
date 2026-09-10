import { fail } from "../fail";
import { os } from "../implementer";
import { requireTicket } from "../state";
import { linkedPrs } from "../summaries";

export const pullRequests = {
	list: os.pullRequests.list.handler(({ context, input }) =>
		linkedPrs(context.state, requireTicket(context.state, input.ticket).id),
	),
	link: os.pullRequests.link.handler(() => {
		throw new Error("The fake server does not link a pull request yet.");
	}),
	unlink: os.pullRequests.unlink.handler(({ context, input }) => {
		const ticket = requireTicket(context.state, input.ticket);
		context.state.prLinks = context.state.prLinks.filter(
			(link) => !(link.ticketId === ticket.id && link.prId === input.id),
		);
		return { deleted: input.id };
	}),
	refresh: os.pullRequests.refresh.handler(() => {
		throw new Error("The fake server does not refresh a pull request yet.");
	}),
	// margin renders the diff, so the web client never asks for one.
	diff: os.pullRequests.diff.handler(() => {
		throw fail("GH_UNAVAILABLE", { reason: "missing" });
	}),
};
