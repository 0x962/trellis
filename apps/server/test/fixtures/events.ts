import type { TrellisEvent } from "@trellis/api";
import { ulid } from "ulid";

// Wire-shaped events for the bus tests. The bus reads the scope of an event
// from its payload: a ticket event names its ticket and its project, a
// comment event its ticket, a statuses or project event its project.
type TicketEventType = "ticket.created" | "ticket.updated" | "ticket.deleted";

export type TicketScope = { ticketId?: string; projectId?: string; version?: number };

export const ticketEvent = (type: TicketEventType, scope: TicketScope = {}): TrellisEvent => {
	const ticketId = scope.ticketId ?? ulid();
	const projectId = scope.projectId ?? ulid();
	return {
		type,
		batchId: ulid(),
		fields: ["title"],
		summary: {
			id: ticketId,
			identifier: "CDE-1",
			number: 1,
			title: "First",
			priority: "none",
			status: { id: ulid(), slug: "todo", name: "Todo", category: "todo", reviewer: null, color: "fg" },
			project: { id: projectId, key: "CDE", path: "CDE" },
			parent: null,
			childCount: 0,
			childDoneCount: 0,
			commentCount: 0,
			attachmentCount: 0,
			pr: null,
			lastActor: null,
			position: 1024,
			version: scope.version ?? 1,
			createdAt: "2026-09-09T10:00:00.000Z",
			updatedAt: "2026-09-09T10:00:00.000Z",
			completedAt: null,
		},
	};
};

export const prEvent = (
	type: "pr.linked" | "pr.unlinked" | "pr.updated",
	ticketIds: string[] = [ulid()],
): TrellisEvent => ({
	type,
	id: ulid(),
	ticketIds,
	state: "open",
	ciState: "pending",
});

export const commentEvent = (
	type: "comment.created" | "comment.updated" | "comment.deleted",
	ticketId: string = ulid(),
): TrellisEvent => ({ type, id: ulid(), ticketId });

export const statusesChanged = (projectId: string = ulid()): TrellisEvent => ({ type: "statuses.changed", projectId });

export const projectEvent = (
	type: "project.created" | "project.updated" | "project.deleted" | "project.moved",
	id: string = ulid(),
): TrellisEvent => ({ type, id });

// One event of every name a service emits, for a filter that must match none.
export const everyServiceEvent = (): TrellisEvent[] => [
	ticketEvent("ticket.created"),
	ticketEvent("ticket.updated"),
	ticketEvent("ticket.deleted"),
	prEvent("pr.linked"),
	prEvent("pr.unlinked"),
	prEvent("pr.updated"),
	commentEvent("comment.created"),
	commentEvent("comment.updated"),
	commentEvent("comment.deleted"),
	{ type: "attachment.created", id: ulid(), ticketId: ulid() },
	{ type: "attachment.deleted", id: ulid(), ticketId: ulid() },
	statusesChanged(),
	projectEvent("project.created"),
	projectEvent("project.updated"),
	projectEvent("project.deleted"),
	projectEvent("project.moved"),
	{ type: "gh.status", ok: true },
];
