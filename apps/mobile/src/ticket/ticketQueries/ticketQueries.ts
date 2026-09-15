import { generateOperationKey } from "@orpc/tanstack-query";
import type { QueryKey } from "@tanstack/react-query";
import type { Priority, Status, StatusListOutput, Ticket, TicketUpdateInput, TrellisClient } from "@trellis/api";
import { approveTarget, sendBackTarget } from "../reviewTargets";

export type Query<T> = {
	queryKey: QueryKey;
	queryFn: () => Promise<T>;
};

// Every key is the oRPC operation key `[path, {input}]`, so the event
// applier and its coalescer find the entries by path and input.
export const ticketDetailKey = (identifier: string): QueryKey =>
	generateOperationKey(["tickets", "get"], { input: { ticket: identifier } });

export const statusesKey = (projectRef: string): QueryKey =>
	generateOperationKey(["statuses", "list"], { input: { project: projectRef } });

// The detail entry. Its key is the oRPC operation key for `tickets.get`
// with `{ticket}` as input, so the event applier finds it.
export const ticketDetailQuery = (client: TrellisClient, identifier: string): Query<Ticket> => ({
	queryKey: ticketDetailKey(identifier),
	queryFn: () => client.tickets.get({ ticket: identifier }),
});

// The effective statuses of the ticket's project.
export const statusesQuery = (client: TrellisClient, projectRef: string): Query<StatusListOutput> => ({
	queryKey: statusesKey(projectRef),
	queryFn: () => client.statuses.list({ project: projectRef }),
});

// The ticket as the screen shows it before the server answers a status or a
// priority change. The version stays, so the response outranks the patch.
export const withStatus = (ticket: Ticket, status: Status): Ticket => {
	const { id, slug, name, category, reviewer, color } = status;
	return { ...ticket, status: { id, slug, name, category, reviewer, color } };
};

export const withPriority = (ticket: Ticket, priority: Priority): Ticket => ({ ...ticket, priority });

// The `tickets.update` input of one field change, guarded by the version
// the screen holds.
export const statusInput = (ticket: Ticket, status: Status): TicketUpdateInput => ({
	ticket: ticket.identifier,
	status: status.id,
	expectedVersion: ticket.version,
});

export const priorityInput = (ticket: Ticket, priority: Priority): TicketUpdateInput => ({
	ticket: ticket.identifier,
	priority,
	expectedVersion: ticket.version,
});

// The `tickets.update` input Approve sends: the status after the ticket's
// status in column order, and the ticket's version.
export const approveInput = (ticket: Ticket, statuses: readonly Status[]): TicketUpdateInput => ({
	ticket: ticket.identifier,
	status: approveTarget(statuses, ticket.status).id,
	expectedVersion: ticket.version,
});

export const approve = (client: TrellisClient, ticket: Ticket, statuses: readonly Status[]): Promise<Ticket> =>
	client.tickets.update(approveInput(ticket, statuses));

// Send back posts `reason` as a comment, then moves the ticket to the lowest
// started status. The comment bumps the ticket's version, so the move
// carries no expectedVersion.
export const sendBack = async (
	client: TrellisClient,
	ticket: Ticket,
	statuses: readonly Status[],
	reason: string,
): Promise<Ticket> => {
	await client.comments.create({ ticket: ticket.identifier, body: reason });
	return client.tickets.update({ ticket: ticket.identifier, status: sendBackTarget(statuses).id });
};
