// Wire-shaped fixtures for the api tests. Every id is a Crockford base32 ULID,
// the id format every trellis row uses on the wire.
export const ulid = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";
export const t1 = "01J8Z6X4Q3M2K1H0G9F8E7D6T1";
export const t2 = "01J8Z6X4Q3M2K1H0G9F8E7D6T2";
export const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";
export const statusId = "01J8Z6X4Q3M2K1H0G9F8E7D6S1";
export const bootId = "01J8Z6X4Q3M2K1H0G9F8E7D6B0";

export const statusSummary = (overrides: Record<string, unknown> = {}) => ({
	id: statusId,
	slug: "in-progress",
	name: "In Progress",
	category: "started",
	reviewer: null,
	color: "warning",
	...overrides,
});

// One TicketSummary with every field the plan lists, all nullable ones null.
export const ticketSummary = (overrides: Record<string, unknown> = {}) => ({
	id: t1,
	identifier: "CDE-42",
	number: 42,
	title: "First",
	priority: "medium",
	status: statusSummary(),
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

// The `tickets.get` shape: a summary plus the fields only the detail carries.
export const ticket = (overrides: Record<string, unknown> = {}) => ({
	...ticketSummary(),
	description: "Body",
	children: [],
	prs: [],
	attachments: [],
	...overrides,
});

// The query key `@orpc/tanstack-query` builds for `queryOptions({ input })`:
// `[path, { input, type: "query" }]`. A key without an input omits `input`.
export const queryKey = (path: string[], input?: unknown) =>
	input === undefined ? [path, { type: "query" }] : [path, { input, type: "query" }];
