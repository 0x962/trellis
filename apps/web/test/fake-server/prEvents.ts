import type { EventName, EventPayload, PullRequest } from "@trellis/api";
import type { EventBus } from "./events";
import { identifierOf, type State } from "./state";

// Every ticket that holds the pull request, in link order.
export const holdersOf = (state: State, prId: string) =>
	state.prLinks.filter((link) => link.prId === prId).map((link) => state.tickets.get(link.ticketId)!);

// Sends one pull request event and returns the payload a client applies. A
// stream scoped to a ticket carries that ticket's events only, so a pull
// request on two tickets sends one frame per ticket.
export const emitPr = (
	state: State,
	bus: EventBus,
	type: Extract<EventName, "pr.linked" | "pr.unlinked" | "pr.updated">,
	pr: PullRequest,
): EventPayload<"pr.updated"> => {
	const holders = holdersOf(state, pr.id);
	const payload = {
		id: pr.id,
		ticketIds: holders.map((ticket) => ticket.id),
		ticketIdentifiers: holders.map((ticket) => identifierOf(state, ticket)),
		owner: pr.owner,
		repo: pr.repo,
		number: pr.number,
		url: pr.url,
		title: pr.title,
		state: pr.state,
		ciState: pr.ciState,
	};
	for (const ticket of holders) bus.emit(type, payload, { ticketId: ticket.id, projectId: ticket.projectId });
	return payload;
};
