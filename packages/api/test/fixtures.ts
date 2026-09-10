import { generateOperationKey } from "@orpc/tanstack-query";

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

// One builder session as `agents.sessions` returns it. Superset ids are
// opaque strings, so the fixture uses short ones.
export const agentSession = (overrides: Record<string, unknown> = {}) => ({
	id: ulid,
	projectId,
	ticketId: t1,
	role: "builder",
	runner: "superset",
	state: "running",
	workspaceId: "ws-7f3a",
	terminalId: "term-1",
	title: "CDE-42",
	openUrl: "superset://workspace/ws-7f3a",
	failure: null,
	lastWokenAt: null,
	createdAt: "2026-09-10T10:00:00.000Z",
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

// The query keys `@orpc/tanstack-query` builds for `queryOptions({ input })`
// and `infiniteOptions({ input })`. The library's own key builder makes them,
// so a fixture key always has the shape the web app's cache holds.
export const queryKey = (path: string[], input?: unknown): unknown[] =>
	generateOperationKey(path, { input, type: "query" });

export const infiniteQueryKey = (path: string[], input: unknown): unknown[] =>
	generateOperationKey(path, { input, type: "infinite" });

// One pull request as `tickets.get` and `pullRequests.list` return it.
export const linkedPullRequest = (overrides: Record<string, unknown> = {}) => ({
	id: ulid,
	owner: "0x962",
	repo: "trellis",
	number: 7,
	url: "https://github.com/0x962/trellis/pull/7",
	title: "Add the thing",
	state: "open",
	isDraft: false,
	headRef: "cde-42-thing",
	baseRef: "main",
	reviewState: "none",
	mergedAt: null,
	closedAt: null,
	checks: [],
	ciState: "none",
	fetchedAt: null,
	fetchError: null,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:05:00.000Z",
	source: "manual",
	linkedBy: { name: "navid", kind: "human" },
	linkedAt: "2026-09-09T10:05:00.000Z",
	...overrides,
});
