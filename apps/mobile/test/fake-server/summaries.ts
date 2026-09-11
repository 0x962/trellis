import type {
	CiState,
	LinkedPullRequest,
	Project,
	ProjectSummary,
	PullRequest,
	Ticket,
	TicketSummary,
} from "@trellis/api";
import { isOpen, statusSummary } from "./refs";
import {
	ancestorsOf,
	childrenOf,
	effectiveStatuses,
	identifierOf,
	type ProjectRow,
	type State,
	subtree,
	type TicketRow,
} from "./state";

// The wire shapes, built from the rows on every read.

export const linkedPrs = (state: State, ticketId: string): LinkedPullRequest[] =>
	state.prLinks
		.filter((link) => link.ticketId === ticketId)
		.map((link) => ({
			...state.prs.get(link.prId)!,
			source: link.source,
			linkedBy: link.linkedBy,
			linkedAt: link.linkedAt,
		}));

// Any fail or cancel gives fail; else any pending gives pending; else any
// pass gives pass; else none.
export const foldCi = (prs: PullRequest[]): CiState => {
	const buckets = prs.flatMap((pr) => pr.checks.map((check) => check.bucket));
	if (buckets.some((bucket) => bucket === "fail" || bucket === "cancel")) return "fail";
	if (buckets.some((bucket) => bucket === "pending")) return "pending";
	if (buckets.some((bucket) => bucket === "pass")) return "pass";
	return "none";
};

// The PR badge of a row: the worst state across its pull requests and the
// check counts behind the ribbon.
export const prBadge = (state: State, ticketId: string): TicketSummary["pr"] => {
	const prs = linkedPrs(state, ticketId);
	if (prs.length === 0) return null;
	const checks = prs.flatMap((pr) => pr.checks);
	const state_ = prs.some((pr) => pr.state === "open")
		? "open"
		: prs.some((pr) => pr.state === "merged")
			? "merged"
			: "closed";
	return {
		state: state_,
		ciState: foldCi(prs),
		pass: checks.filter((check) => check.bucket === "pass").length,
		fail: checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").length,
		pending: checks.filter((check) => check.bucket === "pending").length,
	};
};

export const childrenOfTicket = (state: State, ticketId: string) =>
	[...state.tickets.values()].filter((ticket) => ticket.parentId === ticketId).sort((a, b) => a.number - b.number);

export const ticketSummary = (state: State, row: TicketRow): TicketSummary => {
	const project = state.projects.get(row.projectId)!;
	const parent = row.parentId === null ? null : state.tickets.get(row.parentId)!;
	const children = childrenOfTicket(state, row.id);
	return {
		id: row.id,
		identifier: identifierOf(state, row),
		number: row.number,
		title: row.title,
		priority: row.priority,
		status: statusSummary(state.statuses.get(row.statusId)!),
		project: { id: project.id, key: project.key, path: project.path },
		parent: parent === null ? null : { id: parent.id, identifier: identifierOf(state, parent) },
		childCount: children.length,
		childDoneCount: children.filter((child) => state.statuses.get(child.statusId)!.category === "done").length,
		commentCount: [...state.comments.values()].filter((comment) => comment.ticketId === row.id).length,
		attachmentCount: [...state.attachments.values()].filter((attachment) => attachment.ticketId === row.id).length,
		pr: prBadge(state, row.id),
		lastActor: row.lastActor,
		position: row.position,
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		completedAt: row.completedAt,
	};
};

export const fullTicket = (state: State, row: TicketRow): Ticket => ({
	...ticketSummary(state, row),
	description: row.description,
	children: childrenOfTicket(state, row.id).map((child) => ticketSummary(state, child)),
	prs: linkedPrs(state, row.id),
	attachments: [...state.attachments.values()].filter((attachment) => attachment.ticketId === row.id),
});

const ticketsUnder = (state: State, project: ProjectRow) => {
	const ids = new Set(subtree(state, project.id).map((entry) => entry.id));
	return [...state.tickets.values()].filter((ticket) => ids.has(ticket.projectId));
};

// Open: the category is not done or canceled. Needs you: a human-reviewer
// status, or an open ticket with a failing check.
export const projectCounts = (state: State, project: ProjectRow) => {
	const tickets = ticketsUnder(state, project);
	const open = tickets.filter((ticket) => isOpen(state, ticket));
	const needsYou = open.filter((ticket) => {
		const status = state.statuses.get(ticket.statusId)!;
		return (
			(status.category === "review" && status.reviewer === "human") || prBadge(state, ticket.id)?.ciState === "fail"
		);
	});
	return { openCount: open.length, needsYouCount: needsYou.length };
};

export const projectSummary = (state: State, project: ProjectRow): ProjectSummary => ({
	id: project.id,
	key: project.key,
	path: project.path,
	parentId: project.parentId,
	rootId: project.rootId,
	slug: project.slug,
	name: project.name,
	depth: project.depth,
	position: project.position,
	archivedAt: project.archivedAt,
	...projectCounts(state, project),
});

export const fullProject = (state: State, project: ProjectRow): Project => {
	const { statuses, inheritedFrom } = effectiveStatuses(state, project);
	return {
		...projectSummary(state, project),
		description: project.description,
		ticketTemplate: project.ticketTemplate,
		ticketCounter: project.ticketCounter,
		createdAt: project.createdAt,
		updatedAt: project.updatedAt,
		ancestors: ancestorsOf(state, project).map((ancestor) => ({
			id: ancestor.id,
			key: ancestor.key,
			path: ancestor.path,
			slug: ancestor.slug,
			name: ancestor.name,
		})),
		children: childrenOf(state, project.id).map((child) => projectSummary(state, child)),
		repos: project.repos,
		statuses,
		statusesInheritedFrom: inheritedFrom,
	};
};
