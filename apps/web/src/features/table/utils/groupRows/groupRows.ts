import {
	type MilestoneLink,
	type Priority,
	type Sort,
	type StatusCategory,
	StatusCategorySchema,
	type StatusSummary,
	type TicketSummary,
} from "@trellis/api";
import { projectSlashPath } from "../../../../lib/projectPath";
import type { Group } from "../../../filters/grammar";
import { turnBucketOf, type WorkingTicketIds } from "../turnGroups";

// A status of the scope, with the position the owner configured.
export type GroupStatus = StatusSummary & { position?: number };

export type RowGroup = {
	// The URL-safe identity of the group: a status slug, a priority, a
	// project ref, a parent identifier, an epic id, a milestone id, a turn,
	// a PR state, or `all`.
	key: string;
	// The heading. Null when grouping is off.
	label: string | null;
	rows: TicketSummary[];
	status?: StatusSummary;
	category?: StatusCategory;
	// The milestone of a milestone group. The No milestone group has none.
	milestone?: MilestoneLink;
};

export type GroupOptions = {
	group: Group;
	sort: Sort;
	statuses: readonly GroupStatus[];
	// The viewed project ref. A project label is the path under it.
	project?: string;
	// The milestone ids in display order: the milestones of one epic in
	// position order, then the milestones of the next epic. The milestone
	// grouping reads it. A milestone outside the list sorts after the list.
	milestoneOrder?: readonly string[];
	// The rank of a row inside its group. A lower rank comes first, and the
	// view's sort orders the rows of one rank.
	rowRank?: RowRank;
	// The turn grouping reads it. Every other grouping ignores it.
	workingTicketIds?: WorkingTicketIds;
};

export type RowRank = (row: TicketSummary) => number;

// The order the priorities sort in: the most important first.
const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

const categoryRank = (category: StatusCategory) => StatusCategorySchema.options.indexOf(category);

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const statusRank = (statuses: readonly GroupStatus[], status: StatusSummary) => {
	const configured = statuses.find((entry) => entry.slug === status.slug);
	return categoryRank(status.category) * 1000 + (configured?.position ?? 0);
};

type Key = (row: TicketSummary) => number | string;

const keyOf = (field: string, statuses: readonly GroupStatus[]): Key => {
	if (field === "updatedAt") return (row) => row.updatedAt;
	if (field === "createdAt") return (row) => row.createdAt;
	if (field === "priority") return (row) => -priorityRank[row.priority];
	if (field === "number") return (row) => row.number;
	if (field === "status") return (row) => statusRank(statuses, row.status);
	return (row) => row.position;
};

const compareKeys = (left: number | string, right: number | string) =>
	typeof left === "number" ? left - (right as number) : compareText(left, right as string);

const closed = (row: TicketSummary) => (row.status.category === "done" || row.status.category === "canceled" ? 1 : 0);

// The rows in the view's order. The default sort, `-updatedAt`, puts the
// open rows first, the priority second, and the newest update third. Every
// other sort follows its field alone. A tie breaks by id descending, so two
// calls agree. `rowRank` orders the rows before all of that.
export const sortRows = (
	rows: readonly TicketSummary[],
	sort: Sort,
	statuses: readonly GroupStatus[],
	rowRank?: RowRank,
) => {
	const desc = sort.startsWith("-");
	const key = keyOf(sort.replace(/^-/, ""), statuses);
	const byPriority = sort === "-updatedAt";
	return [...rows].sort((a, b) => {
		if (rowRank !== undefined) {
			const ranked = rowRank(a) - rowRank(b);
			if (ranked !== 0) return ranked;
		}
		if (byPriority) {
			const open = closed(a) - closed(b);
			if (open !== 0) return open;
			const rank = priorityRank[a.priority] - priorityRank[b.priority];
			if (rank !== 0) return rank;
		}
		const order = compareKeys(key(a), key(b));
		if (order !== 0) return desc ? -order : order;
		return -compareText(a.id, b.id);
	});
};

type Bucket = {
	key: string;
	label: string;
	rank: number | string;
	status?: StatusSummary;
	category?: StatusCategory;
	milestone?: MilestoneLink;
};

// U+FFFF is the highest single code unit, so this rank sorts after every
// name that compareText can see.
const lastRank = "\uFFFF";

const prLabels: Record<string, string> = { open: "Open PR", merged: "Merged PR", closed: "Closed PR", none: "No PR" };
const prRank: Record<string, number> = { open: 0, merged: 1, closed: 2, none: 3 };

// The bucket a row falls into for a grouping field.
const bucketOf = (row: TicketSummary, options: GroupOptions): Bucket => {
	switch (options.group) {
		case "status":
			return {
				key: row.status.slug,
				label: row.status.name,
				rank: statusRank(options.statuses, row.status),
				status: row.status,
				category: row.status.category,
			};
		case "priority":
			return {
				key: row.priority,
				label: row.priority.charAt(0).toUpperCase() + row.priority.slice(1),
				rank: priorityRank[row.priority],
			};
		case "project":
			return { key: row.project.path, label: projectLabel(row.project.path, options.project), rank: row.project.path };
		case "parent":
			return row.parent === null
				? { key: "none", label: "No parent", rank: "~" }
				: { key: row.parent.identifier, label: row.parent.identifier, rank: row.parent.identifier };
		case "epic":
			// Names rank in lower case, so `billing` and `Billing` sit together.
			return row.epic === null
				? { key: "none", label: "No epic", rank: lastRank }
				: { key: row.epic.id, label: row.epic.name, rank: row.epic.name.toLowerCase() };
		case "milestone": {
			if (row.milestone === null) return { key: "none", label: "No wave", rank: Number.POSITIVE_INFINITY };
			const order = options.milestoneOrder ?? [];
			const index = order.indexOf(row.milestone.id);
			return {
				key: row.milestone.id,
				label: row.milestone.name,
				rank: index === -1 ? order.length : index,
				milestone: row.milestone,
			};
		}
		case "turn":
			return turnBucketOf(row, options.workingTicketIds);
		case "pr": {
			const state = row.pr?.state ?? "none";
			return { key: state, label: prLabels[state]!, rank: prRank[state]! };
		}
		case "none":
			return { key: "all", label: "", rank: 0 };
	}
};

// `CDE.web.auth` under `CDE` reads `web/auth`; the viewed project itself
// reads its own path.
export const projectLabel = (path: string, viewed?: string) => {
	if (viewed === undefined || path === viewed) return projectSlashPath(path);
	return projectSlashPath(path.slice(viewed.length + 1));
};

// The groups of a row set in display order, each sorted by `rowRank` and
// then by the view's sort. Every row lands in exactly one group.
export const groupRows = (rows: readonly TicketSummary[], options: GroupOptions): RowGroup[] => {
	const buckets = new Map<string, Bucket & { rows: TicketSummary[] }>();
	for (const row of rows) {
		const bucket = bucketOf(row, options);
		const entry = buckets.get(bucket.key) ?? { ...bucket, rows: [] };
		entry.rows.push(row);
		buckets.set(bucket.key, entry);
	}
	return [...buckets.values()]
		.sort((a, b) => compareKeys(a.rank, b.rank))
		.map(({ key, label, status, category, milestone, rows: members }) => ({
			key,
			label: options.group === "none" ? null : label,
			rows: sortRows(members, options.sort, options.statuses, options.rowRank),
			status,
			category,
			milestone,
		}));
};
