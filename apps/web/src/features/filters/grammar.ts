import {
	CiStateSchema,
	LabelRefStringSchema,
	type ListQueryInput,
	ListQuerySchema,
	PrFilterSchema,
	PrioritySchema,
	ProjectRefStringSchema,
	ReviewerSchema,
	SortSchema,
	StatusCategorySchema,
	StatusRefStringSchema,
} from "@trellis/api";
import type { z } from "zod";
import { searchParamOrder } from "../../lib/searchParams";
import type { Density } from "../../stores/uiStore";

export type Group = "none" | "status" | "priority" | "project" | "parent" | "epic" | "wave" | "turn" | "pr";
export type Scope = "subprojects" | "self";

// The list fields a chip can negate. `not` names the fields whose value
// set carries the leading `!` in the URL.
export type NegatableField = "status" | "priority" | "project" | "label";

// The view state of a list route: the shared list grammar plus the
// web-only fields. A time bound keeps the short form a person types (`7d`);
// `toListQuery` turns it into an ISO instant.
export type View = {
	// A project chip: a project ref that narrows the list on /all.
	project?: string;
	status?: string[];
	category?: z.infer<typeof StatusCategorySchema>[];
	// The canonical refs of the labels a ticket must hold: `bug`, or
	// `type/feature` for a label of a group. The value `none` stands for a
	// ticket with no label at all.
	label?: string[];
	reviewer?: z.infer<typeof ReviewerSchema>;
	priority?: z.infer<typeof PrioritySchema>[];
	parent?: string;
	// An epic ref, `OP/routine-runtime`, or `none` for the tickets outside
	// every epic.
	epic?: string;
	// A wave ref, `OP/routine-runtime/phase-1`, or `none` for the tickets
	// outside every wave.
	wave?: string;
	pr?: z.infer<typeof PrFilterSchema>;
	ci?: z.infer<typeof CiStateSchema>[];
	actor?: string;
	q?: string;
	updated?: string;
	created?: string;
	completed?: string;
	sort: z.infer<typeof SortSchema>;
	group: Group;
	// "hide" drops the Done and Canceled groups from a status grouping. The
	// URL carries it only when set, so a view shows them by default.
	closed?: "hide";
	// The tab of the epic page. The Plan tab is the default, so the URL
	// carries the field only for the Resources tab. Every other route
	// drops it.
	tab?: "resources";
	scope: Scope;
	density: Density;
	limit: number;
	not?: NegatableField[];
};

export const viewDefaults = {
	sort: "-updatedAt",
	group: "status",
	scope: "self",
	density: "comfortable",
	limit: 50,
} as const satisfies Partial<View>;

// The order the params take in a URL: the API grammar first, then the
// web-only fields.
const relativePattern = /^(\d+)([hd])$/;
// Saved bookmarks can carry the "milestone" key. Read it so each bookmark still opens.
const legacyWaveKey = "milestone";

const groups: ReadonlySet<string> = new Set([
	"none",
	"status",
	"priority",
	"project",
	"parent",
	"epic",
	"wave",
	"turn",
	"pr",
]);
const scopes: ReadonlySet<string> = new Set(["subprojects", "self"]);
const densities: ReadonlySet<string> = new Set(["comfortable", "compact"]);

// A raw search value: the string a URL carries, or the typed value a Link
// or a redirect passes, which the router validates again.
type Raw = string | string[] | number | undefined;

const entries = (value: Raw): string[] => {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") return value.split(",");
	return [];
};

// A comma list where every valid item stays and every other item is dropped.
const list = <T>(value: Raw, item: { safeParse: (v: string) => { success: boolean; data?: T } }) => {
	if (value === undefined || value === "") return undefined;
	const items = entries(value)
		.map((entry) => item.safeParse(entry))
		.filter((result) => result.success)
		.map((result) => result.data as T);
	return items.length === 0 ? undefined : items;
};

const single = <T>(value: Raw, item: { safeParse: (v: string) => { success: boolean; data?: T } }) => {
	if (typeof value !== "string" || value === "") return undefined;
	const result = item.safeParse(value);
	return result.success ? (result.data as T) : undefined;
};

const oneOf = <T extends string>(value: Raw, set: ReadonlySet<string>) =>
	typeof value === "string" && set.has(value) ? (value as T) : undefined;

const timeBound = (value: Raw) => {
	if (typeof value !== "string") return undefined;
	if (relativePattern.test(value)) return value;
	return single(value, ListQuerySchema.shape.updated);
};

const text = (value: Raw) => (typeof value !== "string" || value === "" ? undefined : value);

const negatable: NegatableField[] = ["status", "priority", "project", "label"];

// A leading `!` on a negatable field's value negates the whole set. The
// value comes back without it. A typed view from a Link, a navigate, or a
// redirect names the negated fields in `not`, and the router parses that
// view again. So a field in an incoming `not` array stays negated, and a
// second parse returns the view of the first parse.
const splitNegation = (raw: Record<string, Raw>) => {
	const values: Record<string, Raw> = { ...raw };
	const typed = Array.isArray(raw.not) ? raw.not : [];
	const not: NegatableField[] = [];
	for (const field of negatable) {
		const value = raw[field];
		if (typeof value === "string" && value.startsWith("!")) {
			values[field] = value.slice(1);
			not.push(field);
		} else if (typed.includes(field)) {
			not.push(field);
		}
	}
	return { values, not };
};

// Reads the raw URL params into a view. An invalid value is dropped and
// the field takes its default, so a hand-edited URL never crashes a route.
export const parseSearch = (params: Record<string, unknown>): View => {
	const { values: raw, not } = splitNegation(params as Record<string, Raw>);
	const limit = Number(raw.limit);
	const group = raw.group === legacyWaveKey ? "wave" : oneOf<Group>(raw.group, groups);
	const view: View = {
		project: single(raw.project, ProjectRefStringSchema),
		status: list(raw.status, StatusRefStringSchema),
		category: list(raw.category, StatusCategorySchema),
		reviewer: single(raw.reviewer, ReviewerSchema),
		priority: list(raw.priority, PrioritySchema),
		label: list(raw.label, LabelRefStringSchema),
		parent: single(raw.parent, ListQuerySchema.shape.parent),
		epic: single(raw.epic, ListQuerySchema.shape.epic),
		wave: single(raw.wave ?? raw[legacyWaveKey], ListQuerySchema.shape.wave),
		pr: single(raw.pr, PrFilterSchema),
		ci: list(raw.ci, CiStateSchema),
		actor: single(raw.actor, ListQuerySchema.shape.actor),
		q: text(raw.q),
		updated: timeBound(raw.updated),
		created: timeBound(raw.created),
		completed: timeBound(raw.completed),
		sort: single(raw.sort, SortSchema) ?? viewDefaults.sort,
		group: group ?? viewDefaults.group,
		closed: raw.closed === "hide" ? "hide" : undefined,
		tab: raw.tab === "resources" ? "resources" : undefined,
		scope: oneOf<Scope>(raw.scope, scopes) ?? viewDefaults.scope,
		density: oneOf<Density>(raw.density, densities) ?? viewDefaults.density,
		limit: Number.isInteger(limit) && limit >= 1 && limit <= 200 ? limit : viewDefaults.limit,
	};
	for (const key of Object.keys(view) as (keyof View)[]) {
		if (view[key] === undefined) delete view[key];
	}
	const kept = not.filter((field) => view[field] !== undefined);
	if (kept.length > 0) view.not = kept;
	return view;
};

// A view as a caller may hold it: a field is its typed value or the plain
// string a URL carries.
export type ViewInput = { [K in keyof View]?: View[K] | string };

// The view without its defaults: what the URL carries.
export const stripDefaults = <T extends ViewInput>(view: T): Partial<T> => {
	const stripped: Partial<T> = { ...view };
	for (const key of Object.keys(viewDefaults) as (keyof typeof viewDefaults)[]) {
		if (stripped[key] === viewDefaults[key]) delete stripped[key];
	}
	return stripped;
};

// The URL query string of a view, without the leading `?`. A default is
// never written, so `/p/CDE` stays clean.
export const serializeSearch = (view: ViewInput): string => {
	const stripped = stripDefaults(view);
	const not = stripped.not ?? [];
	return searchParamOrder
		.filter((key) => stripped[key] !== undefined)
		.map((key) => {
			const value = stripped[key];
			const bang = not.includes(key as NegatableField) ? "!" : "";
			return `${key}=${bang}${Array.isArray(value) ? value.join(",") : String(value)}`;
		})
		.join("&");
};

const hourMs = 60 * 60 * 1000;

// `7d` is the instant seven days before `now`; an ISO value passes through.
const toInstant = (value: string | undefined, now: Date) => {
	if (value === undefined) return undefined;
	const match = relativePattern.exec(value);
	if (match === null) return value;
	const hours = Number(match[1]) * (match[2] === "d" ? 24 : 1);
	return new Date(now.getTime() - hours * hourMs).toISOString();
};

export type ListQueryOptions = {
	now?: Date;
	// The statuses of the scope. A negated status set goes out as the rest
	// of this list, because the API grammar has no negation.
	statuses?: readonly { slug: string }[];
};

// The values of `all` that are not in `set`.
const complement = <T extends string>(all: readonly T[], set: readonly string[]) =>
	all.filter((value) => !set.includes(value));

const isNegated = (view: View, field: NegatableField) => view.not?.includes(field) ?? false;

// The `tickets.list` input of a view. Only set fields go out, so the URL,
// the request, and the CLI flags name the same filters. A negated project
// has no API form and stays out of the query. A negated label set goes out
// as `labelNot`, which the API answers directly; the rest of the label list
// is never the answer, because a ticket holds several labels at once.
export const toListQuery = (view: View, options: ListQueryOptions = {}): ListQueryInput => {
	const now = options.now ?? new Date();
	const statusSlugs = (options.statuses ?? []).map((status) => status.slug);
	const query: ListQueryInput = {
		project: isNegated(view, "project") ? undefined : view.project,
		status: view.status !== undefined && isNegated(view, "status") ? complement(statusSlugs, view.status) : view.status,
		category: view.category,
		reviewer: view.reviewer,
		priority:
			view.priority !== undefined && isNegated(view, "priority")
				? complement(PrioritySchema.options, view.priority)
				: view.priority,
		label: isNegated(view, "label") ? undefined : view.label,
		labelNot: isNegated(view, "label") ? view.label : undefined,
		parent: view.parent,
		epic: view.epic,
		wave: view.wave,
		pr: view.pr,
		ci: view.ci,
		actor: view.actor,
		q: view.q,
		updated: toInstant(view.updated, now),
		created: toInstant(view.created, now),
		completed: toInstant(view.completed, now),
		sort: view.sort,
		subprojects: view.scope === "self" ? false : undefined,
		limit: view.limit === viewDefaults.limit ? undefined : view.limit,
	};
	for (const key of Object.keys(query) as (keyof ListQueryInput)[]) {
		if (query[key] === undefined) delete query[key];
	}
	return query;
};

// The `tickets.counts` and `tickets.board` input: the filters without
// the order and the page size.
export const toCountsQuery = (view: View, options: ListQueryOptions = {}) => {
	const { sort, limit, cursor, ...filters } = toListQuery(view, options);
	return filters;
};

// A full view from the fields a URL carries: every missing default filled in.
export const viewOf = (partial: Partial<View>): View => ({ ...viewDefaults, ...partial });
