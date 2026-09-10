// Wire-shaped fixtures for the web tests. Every id is a Crockford base32
// ULID, the id format every trellis row uses on the wire.
export const bootId = "01J8Z6X4Q3M2K1H0G9F8E7D6B0";
export const otherBootId = "01J8Z6X4Q3M2K1H0G9F8E7D6B1";
export const ticketId = "01J8Z6X4Q3M2K1H0G9F8E7D6T1";
export const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";
export const statusId = "01J8Z6X4Q3M2K1H0G9F8E7D6S1";
export const batchId = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";

export const eventId = (seq: number, boot = bootId) => `${boot}.${seq}`;

// One TicketSummary with every field the contract lists, nullable ones null.
export const ticketSummary = (overrides: Record<string, unknown> = {}) => ({
	id: ticketId,
	identifier: "CDE-42",
	number: 42,
	title: "Restore the fork pages after the upstream 1.27 merge",
	priority: "high",
	status: {
		id: statusId,
		slug: "human-review",
		name: "Human Review",
		category: "review",
		reviewer: "human",
		color: "accent",
	},
	project: { id: projectId, key: "CDE", path: "CDE.web" },
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

export const ticket = (overrides: Record<string, unknown> = {}) => ({
	...ticketSummary(),
	description: "Body",
	children: [],
	prs: [],
	attachments: [],
	...overrides,
});

// The `ready` payload the events route sends first on every connection.
export const readyPayload = (seq: number, boot = bootId) => ({
	id: eventId(seq, boot),
	bootId: boot,
	serverVersion: "0.0.0",
	apiVersion: "1",
});

export const updatedPayload = (version: number, fields: string[] = ["title"]) => ({
	summary: ticketSummary({ version }),
	fields,
	batchId,
});
