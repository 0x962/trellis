import {
	type Activity,
	type Attachment,
	activityActions,
	type Comment,
	type LinkedPullRequest,
	type Status,
	type Ticket,
	type TicketSummary,
	type TimelineItem,
} from "@trellis/api";

// Wire-shaped fixtures. Every id is a Crockford base32 ULID, the id format
// every trellis row uses on the wire.
export const ulid = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";
export const ticketId = "01J8Z6X4Q3M2K1H0G9F8E7D6T1";
export const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";
export const statusId = "01J8Z6X4Q3M2K1H0G9F8E7D6S1";

// A distinct ULID per two-character Crockford suffix, such as "S2" or "C4".
export const id = (suffix: string) => `01J8Z6X4Q3M2K1H0G9F8E7D6${suffix}`;

// A stamp this many milliseconds before now.
export const ago = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();

export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

export const dana = { name: "dana", kind: "human" } as const;
export const claude = { name: "claude", kind: "agent" } as const;

// One TicketSummary as `tickets.list` returns it, every nullable field null.
export const ticketSummary = (overrides: Partial<TicketSummary> = {}): TicketSummary => ({
	id: ticketId,
	identifier: "CDE-42",
	number: 42,
	title: "Restore the five settings pages the upgrade dropped",
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
	ancestors: [],
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

export const status = (overrides: Partial<Status> = {}): Status => ({
	id: statusId,
	slug: "in-progress",
	name: "In Progress",
	category: "started",
	reviewer: null,
	color: "warning",
	projectId,
	description: "",
	position: 100,
	wipLimit: null,
	agentConfig: null,
	isDefault: false,
	createdAt: "2026-09-01T10:00:00.000Z",
	updatedAt: "2026-09-01T10:00:00.000Z",
	...overrides,
});

// The six statuses a root is seeded with, at positions 100 to 600.
export const seededStatuses = (): Status[] => [
	status({
		id: id("S1"),
		slug: "todo",
		name: "Todo",
		category: "todo",
		color: "fg-faint",
		position: 100,
		isDefault: true,
	}),
	status({ id: id("S2"), slug: "in-progress", name: "In Progress", category: "started", position: 200 }),
	status({
		id: id("S3"),
		slug: "agent-review",
		name: "Agent Review",
		category: "review",
		reviewer: "agent",
		color: "agent",
		position: 300,
	}),
	status({
		id: id("S4"),
		slug: "human-review",
		name: "Human Review",
		category: "review",
		reviewer: "human",
		color: "accent",
		position: 400,
	}),
	status({ id: id("S5"), slug: "done", name: "Done", category: "done", color: "success", position: 500 }),
	status({ id: id("S6"), slug: "canceled", name: "Canceled", category: "canceled", color: "fg-faint", position: 600 }),
];

export const comment = (overrides: Partial<Comment> = {}): Comment => ({
	parentId: null,
	resolvedAt: null,
	id: id("C1"),
	ticketId,
	body: "Plan: restore the five settings pages and keep every marked site.",
	actor: dana,
	createdAt: ago(2 * hour),
	updatedAt: ago(2 * hour),
	...overrides,
});

export const activity = (overrides: Partial<Activity> = {}): Activity => ({
	id: 1,
	batchId: id("B1"),
	rootId: projectId,
	projectId,
	ticketId,
	actor: claude,
	action: activityActions.updated,
	field: "status",
	fromValue: "Todo",
	toValue: "In Progress",
	meta: {},
	createdAt: ago(day),
	...overrides,
});

export const commentItem = (overrides: Partial<Comment> = {}): TimelineItem => ({
	kind: "comment",
	...comment(overrides),
});

export const activityItem = (overrides: Partial<Activity> = {}): TimelineItem => ({
	kind: "activity",
	...activity(overrides),
});

export const pullRequest = (overrides: Partial<LinkedPullRequest> = {}): LinkedPullRequest => ({
	id: id("R1"),
	owner: "acme",
	repo: "web",
	number: 118,
	url: "https://github.com/acme/web/pull/118",
	title: "Restore the settings pages",
	state: "open",
	isDraft: false,
	headRef: "cde-42-restore-settings-pages",
	baseRef: "main",
	reviewState: "approved",
	mergedAt: null,
	closedAt: null,
	checks: ["lint", "typecheck (desktop)", "test (host-service)", "build (macos-arm64)"].map((name) => ({
		name,
		workflow: "ci",
		bucket: "pass" as const,
		link: "https://github.com/acme/web/actions/runs/118",
	})),
	ciState: "pass",
	fetchedAt: ago(2 * hour),
	fetchError: null,
	createdAt: ago(day),
	updatedAt: ago(2 * hour),
	source: "manual",
	linkedBy: claude,
	linkedAt: ago(30 * hour),
	...overrides,
});

export const attachment = (overrides: Partial<Attachment> = {}): Attachment => ({
	id: id("A1"),
	ticketId,
	filename: "settings-pages.png",
	mime: "image/png",
	size: 184_320,
	sha256: "0".repeat(64),
	actor: claude,
	createdAt: ago(30 * hour),
	url: `/api/attachments/${id("A1")}/file`,
	...overrides,
});

// The `tickets.get` shape of CDE-42 as the ticket screen shows it.
export const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
	...ticketSummary({
		status: {
			id: id("S4"),
			slug: "human-review",
			name: "Human Review",
			category: "review",
			reviewer: "human",
			color: "accent",
		},
		project: { id: projectId, key: "CDE", path: "CDE.web" },
		parent: { id: id("T3"), identifier: "CDE-43" },
		childCount: 3,
		childDoneCount: 2,
		commentCount: 4,
		attachmentCount: 1,
		pr: { state: "open", ciState: "pass", pass: 4, fail: 0, pending: 0 },
	}),
	description:
		'The build upgrade dropped five settings pages. Restore each page and keep every marked site.\n\n## Acceptance\n\n- [x] The five routes render\n- [x] `grep -rn "KEEP SITE"` lists every marked site\n- [ ] The desktop typecheck is green',
	children: [],
	prs: [pullRequest()],
	attachments: [attachment()],
	...overrides,
});
