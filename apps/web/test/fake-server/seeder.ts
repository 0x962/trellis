import type { ActorRef, CheckBucket, Priority, ReviewState } from "@trellis/api";
import { addActivity, newId, type ProjectRow, type State, statusesOf, type TicketRow } from "./state";

export const minute = 60 * 1000;
export const hour = 60 * minute;
export const day = 24 * hour;

export const navid: ActorRef = { name: "navid", kind: "human" };
export const claude: ActorRef = { name: "claude-code", kind: "agent" };
export const codex: ActorRef = { name: "codex", kind: "agent" };
export const actors = { navid, claude, codex };
export type ActorName = keyof typeof actors;

const defaultStatuses = [
	["Todo", "todo", "todo", null, "fg-faint", true],
	["In Progress", "in-progress", "started", null, "warning", false],
	["Agent Review", "agent-review", "review", "agent", "agent", false],
	["Human Review", "human-review", "review", "human", "accent", false],
	["Done", "done", "done", null, "success", false],
	["Canceled", "canceled", "canceled", null, "fg-faint", false],
] as const;

export const ticketTemplate = "## Goal\n\n## Acceptance\n\n- [ ] \n";

// Every root project starts with the six default statuses.
export const addDefaultStatuses = (state: State, root: ProjectRow, at: string) => {
	defaultStatuses.forEach(([name, slug, category, reviewer, color, isDefault], position) => {
		const id = newId();
		state.statuses.set(id, {
			id,
			slug,
			name,
			category,
			reviewer,
			color,
			projectId: root.id,
			position,
			wipLimit: null,
			isDefault,
			createdAt: at,
			updatedAt: at,
		});
	});
};

export const addRoot = (state: State, key: string, name: string, position: number, at: string): ProjectRow => {
	const id = newId();
	const project: ProjectRow = {
		id,
		parentId: null,
		rootId: id,
		key,
		slug: key.toLowerCase(),
		path: key,
		name,
		depth: 0,
		position,
		description: "",
		ticketTemplate,
		ticketCounter: 0,
		createdAt: at,
		updatedAt: at,
		archivedAt: null,
		ownsStatuses: true,
		repos: [],
	};
	state.projects.set(id, project);
	addDefaultStatuses(state, project, at);
	return project;
};

export const addChild = (
	state: State,
	parent: ProjectRow,
	slug: string,
	name: string,
	position: number,
	at: string,
) => {
	const id = newId();
	const project: ProjectRow = {
		id,
		parentId: parent.id,
		rootId: parent.rootId,
		key: parent.key,
		slug,
		path: `${parent.path}.${slug}`,
		name,
		depth: parent.depth + 1,
		position,
		description: "",
		ticketTemplate: parent.ticketTemplate,
		ticketCounter: 0,
		createdAt: at,
		updatedAt: at,
		archivedAt: null,
		ownsStatuses: false,
		repos: [],
	};
	state.projects.set(id, project);
	return project;
};

type TicketSpec = {
	project: ProjectRow;
	number: number;
	title: string;
	status: string;
	priority?: Priority;
	parent?: number;
	actor: ActorName;
	// Milliseconds before now for the last change, the creation, and the
	// status change. A done ticket completes at its last change.
	updatedAgo: number;
	createdAgo?: number;
	statusAgo?: number;
	description?: string;
};

// The position counter per status column, so the board order is stable.
const columnPositions = new Map<string, number>();

const nextPosition = (statusId: string) => {
	const next = (columnPositions.get(statusId) ?? 0) + 1024;
	columnPositions.set(statusId, next);
	return next;
};

export const createSeeder = (state: State, now: number) => {
	const ago = (ms: number) => new Date(now - ms).toISOString();
	const byNumber = new Map<string, TicketRow>();

	const addTicket = (spec: TicketSpec): TicketRow => {
		const root = state.projects.get(spec.project.rootId)!;
		const status = statusesOf(state, root.id).find((entry) => entry.slug === spec.status)!;
		const createdAt = ago(spec.createdAgo ?? spec.updatedAgo + 2 * day);
		const updatedAt = ago(spec.updatedAgo);
		const done = status.category === "done" || status.category === "canceled";
		const actor = actors[spec.actor];
		const parent = spec.parent === undefined ? null : byNumber.get(`${root.key}-${spec.parent}`)!;
		const row: TicketRow = {
			id: newId(),
			rootId: root.id,
			projectId: spec.project.id,
			number: spec.number,
			title: spec.title,
			description: spec.description ?? `${spec.title}.\n\n${ticketTemplate}`,
			priority: spec.priority ?? "none",
			statusId: status.id,
			parentId: parent === null ? null : parent.id,
			position: nextPosition(status.id),
			version: 1,
			createdAt,
			updatedAt,
			completedAt: done ? updatedAt : null,
			statusChangedAt: ago(spec.statusAgo ?? spec.updatedAgo),
			lastActor: { ...actor, at: updatedAt },
		};
		state.tickets.set(row.id, row);
		byNumber.set(`${root.key}-${spec.number}`, row);
		root.ticketCounter = Math.max(root.ticketCounter, spec.number);
		addActivity(state, {
			rootId: root.id,
			projectId: spec.project.id,
			ticketId: row.id,
			actor: navid,
			action: "created",
			field: null,
			fromValue: null,
			toValue: null,
			createdAt,
		});
		return row;
	};

	const addStatusActivity = (row: TicketRow, actor: ActorName, from: string, to: string, at: number) => {
		row.version += 1;
		addActivity(state, {
			rootId: row.rootId,
			projectId: row.projectId,
			ticketId: row.id,
			actor: actors[actor],
			action: "changed",
			field: "status",
			fromValue: from,
			toValue: to,
			createdAt: ago(at),
		});
	};

	const addFieldActivity = (
		row: TicketRow,
		actor: ActorName,
		field: string,
		from: string | null,
		to: string,
		at: number,
		batchId?: string,
	) => {
		row.version += 1;
		addActivity(state, {
			rootId: row.rootId,
			projectId: row.projectId,
			ticketId: row.id,
			actor: actors[actor],
			action: "changed",
			field,
			fromValue: from,
			toValue: to,
			createdAt: ago(at),
			...(batchId === undefined ? {} : { batchId }),
		});
	};

	const addComment = (row: TicketRow, actor: ActorName, body: string, at: number) => {
		const id = newId();
		row.version += 1;
		state.comments.set(id, {
			id,
			ticketId: row.id,
			body,
			actor: actors[actor],
			createdAt: ago(at),
			updatedAt: ago(at),
		});
	};

	const addPr = (
		row: TicketRow,
		number: number,
		title: string,
		headRef: string,
		checks: [string, CheckBucket][],
		reviewState: ReviewState,
		at: number,
		actor: ActorName,
	) => {
		const id = newId();
		const isFailing = checks.some(([, bucket]) => bucket === "fail" || bucket === "cancel");
		const isPending = checks.some(([, bucket]) => bucket === "pending");
		state.prs.set(id, {
			id,
			owner: "canary-technologies-corp",
			repo: "de",
			number,
			url: `https://github.com/canary-technologies-corp/de/pull/${number}`,
			title,
			state: "open",
			isDraft: false,
			headRef,
			baseRef: "main",
			reviewState,
			mergedAt: null,
			closedAt: null,
			checks: checks.map(([name, bucket]) => ({
				name,
				workflow: "ci",
				bucket,
				link: `https://github.com/canary-technologies-corp/de/actions/runs/${number}`,
			})),
			ciState: isFailing ? "fail" : isPending ? "pending" : "pass",
			fetchedAt: ago(at),
			fetchError: null,
			createdAt: ago(at + day),
			updatedAt: ago(at),
		});
		state.prLinks.push({ ticketId: row.id, prId: id, source: "manual", linkedBy: actors[actor], linkedAt: ago(at) });
	};

	const addAttachment = (
		row: TicketRow,
		filename: string,
		mime: string,
		size: number,
		actor: ActorName,
		at: number,
	) => {
		const id = newId();
		state.attachments.set(id, {
			id,
			ticketId: row.id,
			filename,
			mime,
			size,
			sha256: id
				.toLowerCase()
				.replace(/[^0-9a-f]/g, "0")
				.padEnd(64, "0"),
			actor: actors[actor],
			createdAt: ago(at),
			url: `/api/attachments/${id}/file`,
		});
	};

	return { ago, byNumber, addTicket, addStatusActivity, addFieldActivity, addComment, addPr, addAttachment };
};

export type Seeder = ReturnType<typeof createSeeder>;
