import { type Activity, type ActorRef, type Status, StatusRefSchema, ulidPattern } from "@trellis/api";
import { fail } from "./fail";
import { actorKey, effectiveStatuses, newId, type ProjectRow, type State, type TicketRow } from "./state";

// The rows a ref on the wire reaches, and the two writes every handler makes
// beside its own: the audit row and the actor row.

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
