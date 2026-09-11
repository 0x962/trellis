import {
	type Activity,
	type Actor,
	type ActorRef,
	type AgentBatchRecord,
	type AgentSession,
	type AgentSettings,
	type Attachment,
	type Comment,
	type GhStatus,
	type Persona,
	type Priority,
	type PrLinkSource,
	type PullRequest,
	type Repo,
	type RunnerProject,
	type RunnerReason,
	type Settings,
	type Status,
	StatusRefSchema,
	ulidPattern,
} from "@trellis/api";
import { ulid } from "ulid";
import { fail } from "./fail";

// The in-memory rows behind the fake server. Every row keeps the shape the
// database would hold; the wire shapes are built from them on read.

export type ProjectRow = {
	id: string;
	parentId: string | null;
	rootId: string;
	key: string;
	slug: string;
	path: string;
	name: string;
	depth: number;
	position: number;
	description: string;
	ticketTemplate: string;
	ticketCounter: number;
	createdAt: string;
	updatedAt: string;
	archivedAt: string | null;
	// A root always owns its statuses. A sub-project owns a set only after
	// it customizes one.
	ownsStatuses: boolean;
	repos: Repo[];
};

export type LastActor = ActorRef & { at: string };

export type TicketRow = {
	id: string;
	rootId: string;
	projectId: string;
	number: number;
	title: string;
	description: string;
	priority: Priority;
	statusId: string;
	parentId: string | null;
	position: number;
	version: number;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	// When the ticket entered its status. The review section orders by it.
	statusChangedAt: string;
	lastActor: LastActor | null;
};

export type PrLink = {
	ticketId: string;
	prId: string;
	source: PrLinkSource;
	linkedBy: ActorRef;
	linkedAt: string;
};

export type State = {
	personas: Map<string, Persona>;
	projects: Map<string, ProjectRow>;
	statuses: Map<string, Status>;
	tickets: Map<string, TicketRow>;
	comments: Map<string, Comment>;
	activity: Activity[];
	prs: Map<string, PullRequest>;
	prLinks: PrLink[];
	attachments: Map<string, Attachment>;
	// The bytes of every stored attachment, keyed by the sha256 of the
	// content. Two uploads of one file share one entry.
	blobs: Map<string, Uint8Array<ArrayBuffer>>;
	actors: Map<string, Actor>;
	settings: Settings;
	// True once the settings hold `defaultActorName`, as on a machine someone
	// set up. `actors.default` reports it as `stored`.
	defaultActorStored: boolean;
	// What `system.gh` reports. A test sets it to drive the gh banner.
	gh: GhStatus;
	// The URLs `system.health` lists. A test sets it to drive the Pair a
	// phone section.
	addresses: string[];
	nextActivityId: number;
	agentSessions: Map<string, AgentSession>;
	agentSettings: AgentSettings;
	// The id of the last activity row each root's manager read, by root id.
	agentCursors: Map<string, number>;
	// What `superset projects list` gives.
	runnerProjects: RunnerProject[];
	// While set, every runner call answers RUNNER_UNAVAILABLE with this reason.
	runnerDown: RunnerReason | null;
	// The batches the dispatcher sent, oldest first. A test pushes to it.
	agentBatches: AgentBatchRecord[];
};

export const createState = (): State => ({
	personas: new Map(),
	projects: new Map(),
	statuses: new Map(),
	tickets: new Map(),
	comments: new Map(),
	activity: [],
	prs: new Map(),
	prLinks: [],
	attachments: new Map(),
	blobs: new Map(),
	actors: new Map(),
	settings: {
		defaultActorName: "navid",
		stalledHours: 24,
		diffUrlTemplate: "{url}/files",
	},
	defaultActorStored: false,
	gh: {
		ok: false,
		user: null,
		reason: "missing",
		message: "gh is not installed. Install it with `brew install gh` and run `gh auth login`.",
		checkedAt: new Date().toISOString(),
	},
	addresses: ["http://192.168.1.20:4521", "http://127.0.0.1:4521"],
	nextActivityId: 1,
	agentSessions: new Map(),
	agentSettings: { runner: "superset", enabled: false, projects: [] },
	agentCursors: new Map(),
	runnerProjects: [
		{
			id: "sp-de",
			name: "de",
			repo: "canary-technologies-corp/de",
			path: "/Users/navid/projects/de",
			defaultBranch: "main",
		},
		{
			id: "sp-trellis",
			name: "trellis",
			repo: "0x962/trellis",
			path: "/Users/navid/projects/trellis",
			defaultBranch: "main",
		},
	],
	runnerDown: null,
	agentBatches: [],
});

export const newId = () => ulid();

export const isoNow = () => new Date().toISOString();

export const actorKey = (actor: ActorRef) => `${actor.kind}:${actor.name}`;

export const rootOf = (state: State, project: ProjectRow) => state.projects.get(project.rootId)!;

export const identifierOf = (state: State, ticket: TicketRow) =>
	`${state.projects.get(ticket.rootId)!.key}-${ticket.number}`;

// Every project under `projectId`, the project itself first, in tree order.
export const subtree = (state: State, projectId: string): ProjectRow[] => {
	const project = state.projects.get(projectId)!;
	const children = childrenOf(state, projectId);
	return [project, ...children.flatMap((child) => subtree(state, child.id))];
};

export const childrenOf = (state: State, projectId: string) =>
	[...state.projects.values()]
		.filter((project) => project.parentId === projectId)
		.sort((a, b) => a.position - b.position);

// The flat list in tree order: each root, then its subtree depth first.
export const projectsInOrder = (state: State): ProjectRow[] =>
	[...state.projects.values()]
		.filter((project) => project.parentId === null)
		.sort((a, b) => a.position - b.position)
		.flatMap((root) => subtree(state, root.id));

export const ancestorsOf = (state: State, project: ProjectRow): ProjectRow[] => {
	const chain: ProjectRow[] = [];
	let current = project.parentId === null ? null : state.projects.get(project.parentId)!;
	while (current !== null) {
		chain.unshift(current);
		current = current.parentId === null ? null : state.projects.get(current.parentId)!;
	}
	return chain;
};

// The project whose status set applies: the project itself when it owns
// one, else the nearest ancestor that does.
export const statusOwner = (state: State, project: ProjectRow): ProjectRow => {
	if (project.ownsStatuses) return project;
	return statusOwner(state, state.projects.get(project.parentId!)!);
};

export const statusesOf = (state: State, ownerId: string): Status[] =>
	[...state.statuses.values()].filter((status) => status.projectId === ownerId).sort((a, b) => a.position - b.position);

export const effectiveStatuses = (state: State, project: ProjectRow) => {
	const owner = statusOwner(state, project);
	return { statuses: statusesOf(state, owner.id), inheritedFrom: owner.id === project.id ? null : owner.id };
};

// A canonical project ref: a ULID or `KEY.slug.slug`.
export const findProject = (state: State, ref: string): ProjectRow | undefined => {
	if (ulidPattern.test(ref)) return state.projects.get(ref);
	return [...state.projects.values()].find((project) => project.path === ref);
};

export const requireProject = (state: State, ref: string): ProjectRow => {
	const project = findProject(state, ref);
	if (project === undefined) throw fail("NOT_FOUND", { kind: "project", ref });
	return project;
};

const identifierPattern = /^([A-Z][A-Z0-9]{1,9})-([1-9][0-9]*)$/;

// A canonical ticket ref: a ULID or `KEY-n`.
export const findTicket = (state: State, ref: string): TicketRow | undefined => {
	if (ulidPattern.test(ref)) return state.tickets.get(ref);
	const match = identifierPattern.exec(ref);
	if (match === null) return undefined;
	const root = [...state.projects.values()].find((project) => project.parentId === null && project.key === match[1]);
	if (root === undefined) return undefined;
	const number = Number(match[2]);
	return [...state.tickets.values()].find((ticket) => ticket.rootId === root.id && ticket.number === number);
};

export const requireTicket = (state: State, ref: string): TicketRow => {
	const ticket = findTicket(state, ref);
	if (ticket === undefined) throw fail("NOT_FOUND", { kind: "ticket", ref });
	return ticket;
};

// A status ref inside one effective set: a ULID, a slug, a lower-cased
// name, or `category:<category>` for the first status of that category.
export const matchStatus = (statuses: Status[], ref: string): Status | undefined => {
	const parsed = StatusRefSchema.parse(ref);
	if (parsed.kind === "ulid") return statuses.find((status) => status.id === parsed.id);
	if (parsed.kind === "category") return statuses.find((status) => status.category === parsed.category);
	const value = parsed.value.toLowerCase();
	return statuses.find((status) => status.slug === value || status.name.toLowerCase() === value);
};

export const requireStatus = (state: State, project: ProjectRow, ref: string): Status => {
	const { statuses } = effectiveStatuses(state, project);
	const status = matchStatus(statuses, ref);
	if (status === undefined) throw fail("STATUS_NOT_IN_PROJECT", { valid: statuses.map(statusSummary) });
	return status;
};

export const statusSummary = (status: Status) => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

export const slugify = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// Every mutation on an archived project is refused; a read still works.
export const requireWritable = (state: State, projectId: string) => {
	if (state.projects.get(projectId)!.archivedAt !== null) throw fail("PROJECT_ARCHIVED", undefined);
};

export const isOpen = (state: State, ticket: TicketRow) => {
	const category = state.statuses.get(ticket.statusId)!.category;
	return category !== "done" && category !== "canceled";
};

// Records one audit row. The timeline lists these beside the comments.
export const addActivity = (
	state: State,
	row: Omit<Activity, "id" | "batchId" | "meta"> & { batchId?: string; meta?: Record<string, unknown> },
) => {
	const activity: Activity = { id: state.nextActivityId, batchId: row.batchId ?? newId(), meta: {}, ...row };
	state.nextActivityId += 1;
	state.activity.push(activity);
	return activity;
};

// Every actor the server has seen. A write by a new name adds a row.
export const touchActor = (state: State, actor: ActorRef, at: string) => {
	const existing = state.actors.get(actorKey(actor));
	if (existing === undefined) state.actors.set(actorKey(actor), { ...actor, firstSeenAt: at, lastSeenAt: at });
	else existing.lastSeenAt = at;
};
