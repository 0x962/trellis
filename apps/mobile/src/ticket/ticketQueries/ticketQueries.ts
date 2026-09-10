import type { QueryKey } from "@tanstack/react-query";
import type {
	Status,
	StatusListOutput,
	Ticket,
	TicketUpdateInput,
	TimelineListOutput,
	TrellisClient,
} from "@trellis/api";

export type Query<T> = {
	queryKey: QueryKey;
	queryFn: () => Promise<T>;
};

// The detail entry. Its key is the oRPC operation key for `tickets.get`
// with `{ticket}` as input, so the event applier finds it.
export const ticketDetailQuery = (_client: TrellisClient, _identifier: string): Query<Ticket> => {
	throw new Error("ticketDetailQuery is not implemented");
};

export const timelineQuery = (_client: TrellisClient, _identifier: string): Query<TimelineListOutput> => {
	throw new Error("timelineQuery is not implemented");
};

// The effective statuses of the ticket's project.
export const statusesQuery = (_client: TrellisClient, _projectRef: string): Query<StatusListOutput> => {
	throw new Error("statusesQuery is not implemented");
};

// The `tickets.update` input Approve sends: the lowest done status and the
// ticket's version.
export const approveInput = (_ticket: Ticket, _statuses: readonly Status[]): TicketUpdateInput => {
	throw new Error("approveInput is not implemented");
};

export const approve = (_client: TrellisClient, _ticket: Ticket, _statuses: readonly Status[]): Promise<Ticket> => {
	throw new Error("approve is not implemented");
};

// Send back posts `reason` as a comment, then moves the ticket to the lowest
// started status with the ticket's version.
export const sendBack = (
	_client: TrellisClient,
	_ticket: Ticket,
	_statuses: readonly Status[],
	_reason: string,
): Promise<Ticket> => {
	throw new Error("sendBack is not implemented");
};
