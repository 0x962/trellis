// Wire-shaped rows for the CLI tests. Every id is a Crockford base32 ULID,
// the id format every trellis row uses on the wire. A test overrides the
// fields it reads and keeps the rest.
export const ticketId = "01J8Z6X4Q3M2K1H0G9F8E7D6T1";
export const ticketId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6T2";
export const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";
export const projectId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6P2";
export const statusId = "01J8Z6X4Q3M2K1H0G9F8E7D6S1";
export const statusId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6S2";
export const statusId3 = "01J8Z6X4Q3M2K1H0G9F8E7D6S3";
export const commentId = "01J8Z6X4Q3M2K1H0G9F8E7D6C1";
export const commentId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6C2";
export const attachmentId = "01J8Z6X4Q3M2K1H0G9F8E7D6A1";
export const prId = "01J8Z6X4Q3M2K1H0G9F8E7D6R1";
export const repoId = "01J8Z6X4Q3M2K1H0G9F8E7D6E1";
export const bootId = "01J8Z6X4Q3M2K1H0G9F8E7D6B0";
export const personaId = "01J8Z6X4Q3M2K1H0G9F8E7D6N1";
export const personaId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6N2";
export const agentRunId = "01J8Z6X4Q3M2K1H0G9F8E7D6G1";

type Overrides = Record<string, unknown>;

export const actor = { name: "dana", kind: "human" };

export const statusSummary = (overrides: Overrides = {}) => ({
	id: statusId,
	slug: "in-progress",
	name: "In Progress",
	category: "started",
	reviewer: null,
	color: "warning",
	...overrides,
});

export const status = (overrides: Overrides = {}) => ({
	...statusSummary(),
	projectId,
	position: 1,
	wipLimit: null,
	isDefault: false,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
	...overrides,
});

// The three statuses `statuses list` answers with, in position order.
export const statusSet = () => ({
	statuses: [
		status({ id: statusId2, slug: "todo", name: "Todo", category: "todo", color: "fg-muted", position: 0 }),
		status({ position: 1 }),
		status({ id: statusId3, slug: "blocked", name: "Blocked", position: 2 }),
	],
	inheritedFrom: null,
});

export const ticketSummary = (overrides: Overrides = {}) => ({
	id: ticketId,
	identifier: "CDE-42",
	number: 42,
	title: "Dark mode",
	priority: "high",
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

export const ticket = (overrides: Overrides = {}) => ({
	...ticketSummary(),
	description: "Body text",
	children: [],
	prs: [],
	attachments: [],
	...overrides,
});

// `count` summaries with identifiers `KEY-1` to `KEY-count`.
export const ticketPage = (count: number, offset = 0, key = "CDE") =>
	Array.from({ length: count }, (_, index) => {
		const number = offset + index + 1;
		return ticketSummary({
			id: `01J8Z6X4Q3M2K1H0G9F8E${String(number).padStart(5, "0")}`,
			identifier: `${key}-${number}`,
			number,
		});
	});

export const projectSummary = (overrides: Overrides = {}) => ({
	id: projectId,
	key: "CDE",
	path: "CDE",
	parentId: null,
	rootId: projectId,
	slug: "cde",
	name: "Code",
	depth: 0,
	position: 0,
	openCount: 3,
	needsYouCount: 1,
	archivedAt: null,
	...overrides,
});

export const repo = (repoName: string, overrides: Overrides = {}) => ({
	id: repoId,
	projectId,
	owner: "0x962",
	repo: repoName,
	...overrides,
});

export const project = (overrides: Overrides = {}) => ({
	...projectSummary(),
	description: "The code project",
	ticketTemplate: "",
	ticketCounter: 42,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
	ancestors: [],
	children: [
		projectSummary({ id: projectId2, path: "CDE.web", parentId: projectId, slug: "web", name: "Web", depth: 1 }),
	],
	repos: [repo("trellis")],
	statuses: statusSet().statuses,
	statusesInheritedFrom: null,
	...overrides,
});

export const comment = (overrides: Overrides = {}) => ({
	kind: "comment",
	id: commentId,
	ticketId,
	body: "Body A",
	actor,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
	...overrides,
});

export const activity = (overrides: Overrides = {}) => ({
	kind: "activity",
	id: 7,
	batchId: bootId,
	rootId: projectId,
	projectId,
	ticketId,
	actor,
	action: "ticket.moved",
	field: "status",
	fromValue: "todo",
	toValue: "human-review",
	meta: {},
	createdAt: "2026-09-09T10:02:00.000Z",
	...overrides,
});

// A timeline page, newest first: a later comment, a status change, an
// earlier comment.
export const timeline = () => ({
	items: [
		comment({
			id: commentId2,
			body: "Body B",
			createdAt: "2026-09-09T10:05:00.000Z",
			updatedAt: "2026-09-09T10:05:00.000Z",
		}),
		activity(),
		comment(),
	],
	nextCursor: null,
});

export const attachment = (overrides: Overrides = {}) => ({
	id: attachmentId,
	ticketId,
	filename: "cover.png",
	mime: "image/png",
	size: 2048,
	sha256: "a".repeat(64),
	actor,
	createdAt: "2026-09-09T10:00:00.000Z",
	url: `/api/attachments/${attachmentId}/file`,
	...overrides,
});

export const linkedPullRequest = (overrides: Overrides = {}) => ({
	id: prId,
	owner: "o",
	repo: "r",
	number: 7,
	url: "https://github.com/o/r/pull/7",
	title: "Add dark mode",
	state: "open",
	isDraft: false,
	headRef: "cde-42-dark-mode",
	baseRef: "main",
	reviewState: "none",
	mergedAt: null,
	closedAt: null,
	checks: [],
	ciState: "pass",
	fetchedAt: "2026-09-09T10:05:00.000Z",
	fetchError: null,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:05:00.000Z",
	source: "manual",
	linkedBy: actor,
	linkedAt: "2026-09-09T10:05:00.000Z",
	...overrides,
});

export const ghOk = () => ({
	ok: true,
	user: "0x962",
	reason: null,
	message: null,
	checkedAt: "2026-09-09T10:00:00.000Z",
});

export const health = (overrides: Overrides = {}) => ({
	ok: true,
	version: "0.0.0",
	apiVersion: "0.0.0",
	bootId,
	rss: 123_456_789,
	addresses: ["http://127.0.0.1:4521"],
	db: { ok: true, sizeBytes: 4_567_890 },
	gh: ghOk(),
	...overrides,
});

export const inbox = () => ({
	review: { items: [ticketSummary()], total: 1 },
	failingCi: { items: [ticketSummary({ id: ticketId2, identifier: "CDE-43", number: 43 })], total: 1 },
	stalled: { items: [], total: 0 },
	doneByAgentsToday: { items: [ticketSummary({ identifier: "CDE-44", number: 44 })], total: 5 },
});

export const persona = (overrides: Overrides = {}) => ({
	id: personaId,
	name: "Feature Builder",
	kind: "builder",
	instruction: "Build the ticket.\nOpen a pull request.",
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
	...overrides,
});

export const agentRun = (overrides: Overrides = {}) => ({
	id: agentRunId,
	name: "Iris Brooks",
	runtime: "superset",
	personaId,
	personaName: "Feature Builder",
	kind: "builder",
	instruction: "Build the ticket.",
	projectId,
	projectPath: "CDE",
	ticketId,
	ticketIdentifier: "CDE-42",
	state: "running",
	workspaceId: "ws-1",
	terminalId: "term-1",
	url: "https://superset.localhost/ws-1",
	error: null,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:05:00.000Z",
	...overrides,
});
