// Wire-shaped fixtures. Every id is a Crockford base32 ULID, the id format
// every trellis row uses on the wire.
export const ulid = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";
export const ticketId = "01J8Z6X4Q3M2K1H0G9F8E7D6T1";
export const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";
export const statusId = "01J8Z6X4Q3M2K1H0G9F8E7D6S1";

// One TicketSummary as `tickets.list` returns it, every nullable field null.
export const ticketSummary = (overrides: Record<string, unknown> = {}) => ({
	id: ticketId,
	identifier: "CDE-42",
	number: 42,
	title: "Restore the fork pages after the upstream 1.27 merge",
	priority: "high",
	status: {
		id: statusId,
		slug: "in-progress",
		name: "In Progress",
		category: "started",
		reviewer: null,
		color: "warning",
	},
	project: { id: projectId, key: "CDE", path: "CDE" },
	parent: null,
	childCount: 0,
	childDoneCount: 0,
	commentCount: 0,
	attachmentCount: 0,
	pr: null,
	lastActor: null,
	position: 1024,
	version: 3,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:05:00.000Z",
	completedAt: null,
	...overrides,
});
