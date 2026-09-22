import type { CiState, PrFilter, Priority, Reviewer, StatusCategory } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { tsquery } from "./fts.ts";
import { reviewDraftSql } from "./pullRequestRows.ts";
import { ciRank, textArray } from "./support.ts";

// The flat filter grammar of tickets.list, with every ref already resolved
// to an id. `rootIds` holds the roots of `projectIds`. The caller reads
// them from the project cache. The partial indexes of tickets start with
// root_id. `parent` is a ticket id or `none` for top-level tickets. `epic`
// is an epic id or `none` for the tickets outside every epic. `wave`
// is a wave id or `none` for the tickets outside every wave.
// `waitsOn` is the id of one dependency. `blocked` tests for an open
// dependency.
// `actor` is `kind:name` or a bare name and matches the last actor.
// `updated`, `created`, and `completed` are ISO "after" bounds.
export type TicketFilter = {
	rootIds?: readonly string[];
	projectIds?: readonly string[];
	statusIds?: readonly string[];
	categories?: readonly StatusCategory[];
	reviewer?: Reviewer;
	priority?: readonly Priority[];
	labelIds?: readonly string[];
	labelNotIds?: readonly string[];
	noLabel?: boolean;
	parent?: string;
	waitsOn?: string;
	blocked?: boolean;
	epic?: string;
	wave?: string;
	pr?: PrFilter;
	ci?: readonly CiState[];
	actor?: string;
	q?: string;
	updated?: string;
	created?: string;
	completed?: string;
};

const linked = (test: SQL) =>
	sql`EXISTS (SELECT 1 FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
		WHERE l.ticket_id = t.id AND ${test})`;

// `labelIds` keeps a ticket that holds one of those labels, and `noLabel`
// keeps a ticket that holds no label. A query names both when the filter
// value is `bug,none`, and a ticket matches either half of it.
const holdsAny = (labelIds: readonly string[]) =>
	sql`EXISTS (SELECT 1 FROM ticket_labels tl WHERE tl.ticket_id = t.id AND tl.label_id = ANY(${textArray(labelIds)}))`;

const holdsNothing = sql`NOT EXISTS (SELECT 1 FROM ticket_labels tl WHERE tl.ticket_id = t.id)`;

const waitsOn = (dependsOnId: string) =>
	sql`EXISTS (SELECT 1 FROM ticket_deps dependency
		WHERE dependency.ticket_id = t.id AND dependency.depends_on_id = ${dependsOnId})`;

const isBlocked = sql`EXISTS (
	SELECT 1 FROM ticket_deps dependency
	JOIN tickets blocker ON blocker.id = dependency.depends_on_id
	JOIN statuses blocker_status ON blocker_status.id = blocker.status_id
	WHERE dependency.ticket_id = t.id AND blocker_status.category NOT IN ('done', 'canceled')
)`;

const labelClause = (labelIds: readonly string[] | undefined, noLabel: boolean | undefined): SQL => {
	if (labelIds === undefined) return holdsNothing;
	return noLabel === true ? sql`(${holdsAny(labelIds)} OR ${holdsNothing})` : holdsAny(labelIds);
};

const prClause = (pr: PrFilter): SQL => {
	switch (pr) {
		case "any":
			return linked(sql`true`);
		case "none":
			return sql`NOT ${linked(sql`true`)}`;
		case "open":
			return linked(sql`p.state = 'open' AND NOT ${reviewDraftSql(sql`p`)} AND NOT p.is_queued`);
		case "draft":
			return linked(sql`p.state = 'open' AND ${reviewDraftSql(sql`p`)}`);
		case "queued":
			return linked(sql`p.state = 'open' AND p.is_queued`);
		default:
			return linked(sql`p.state = ${pr}`);
	}
};

// The worst CI state across the ticket's pull requests. A ticket without a
// pull request has no CI state and matches no value.
const ciClause = (states: readonly CiState[]) =>
	sql`(SELECT p.ci_state FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
		WHERE l.ticket_id = t.id ORDER BY ${ciRank(sql`p.ci_state`)} LIMIT 1) = ANY(${textArray(states)})`;

const actorClause = (actor: string) => {
	const colon = actor.indexOf(":");
	const kind = colon === -1 ? null : actor.slice(0, colon);
	const name = colon === -1 ? actor : actor.slice(colon + 1);
	const kindTest = kind === null ? sql`true` : sql`last.actor_kind = ${kind}`;
	return sql`EXISTS (SELECT 1 FROM (
		SELECT a.actor_name, a.actor_kind FROM activity a
		WHERE a.ticket_id = t.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1
	) last WHERE last.actor_name = ${name} AND ${kindTest})`;
};

// The planner walks a partial index in its key order only under `root_id =`.
// Under `root_id = ANY(...)` it reads every open ticket of the root and sorts
// them, even for one root. So one root gets the equality.
const rootClause = (rootIds: readonly string[]) =>
	rootIds.length === 1 ? sql`t.root_id = ${rootIds[0]}` : sql`t.root_id = ANY(${textArray(rootIds)})`;

// The ticket's status, for the category and reviewer clauses.
const statusWhere = (test: SQL) => sql`EXISTS (SELECT 1 FROM statuses fs WHERE fs.id = t.status_id AND ${test})`;

// The categories whose tickets have no completed_at: a ticket gets
// completed_at on entering done or canceled and loses it on leaving.
const OPEN_CATEGORIES: readonly StatusCategory[] = ["todo", "started", "review"];

// The WHERE clause of a ticket query over the alias `t` (tickets). `q`
// matches the FTS column only; the trigram path belongs to search. A
// category filter within the open categories adds `completed_at IS NULL`,
// the predicate of tickets_open_idx, so the default table query walks that
// index in updated_at order.
export const filterWhere = (filter: TicketFilter): SQL => {
	const clauses: SQL[] = [sql`true`];
	if (filter.rootIds) clauses.push(rootClause(filter.rootIds));
	if (filter.projectIds) clauses.push(sql`t.project_id = ANY(${textArray(filter.projectIds)})`);
	if (filter.statusIds) clauses.push(sql`t.status_id = ANY(${textArray(filter.statusIds)})`);
	if (filter.categories) {
		clauses.push(statusWhere(sql`fs.category = ANY(${textArray(filter.categories)})`));
		if (filter.categories.every((category) => OPEN_CATEGORIES.includes(category))) {
			clauses.push(sql`t.completed_at IS NULL`);
		}
	}
	if (filter.reviewer) clauses.push(statusWhere(sql`fs.reviewer = ${filter.reviewer}`));
	if (filter.priority) clauses.push(sql`t.priority = ANY(${textArray(filter.priority)})`);
	if (filter.labelIds || filter.noLabel) clauses.push(labelClause(filter.labelIds, filter.noLabel));
	if (filter.labelNotIds) clauses.push(sql`NOT ${holdsAny(filter.labelNotIds)}`);
	if (filter.parent === "none") clauses.push(sql`t.parent_id IS NULL`);
	else if (filter.parent) clauses.push(sql`t.parent_id = ${filter.parent}`);
	if (filter.waitsOn) clauses.push(waitsOn(filter.waitsOn));
	if (filter.blocked === true) clauses.push(isBlocked);
	else if (filter.blocked === false) clauses.push(sql`NOT ${isBlocked}`);
	if (filter.epic === "none") clauses.push(sql`t.epic_id IS NULL`);
	else if (filter.epic) clauses.push(sql`t.epic_id = ${filter.epic}`);
	if (filter.wave === "none") clauses.push(sql`t.wave_id IS NULL`);
	else if (filter.wave) clauses.push(sql`t.wave_id = ${filter.wave}`);
	if (filter.pr) clauses.push(prClause(filter.pr));
	if (filter.ci) clauses.push(ciClause(filter.ci));
	if (filter.actor) clauses.push(actorClause(filter.actor));
	if (filter.q) clauses.push(sql`t.search @@ ${tsquery(filter.q)}`);
	if (filter.updated) clauses.push(sql`t.updated_at >= ${filter.updated}::timestamptz`);
	if (filter.created) clauses.push(sql`t.created_at >= ${filter.created}::timestamptz`);
	if (filter.completed) clauses.push(sql`t.completed_at >= ${filter.completed}::timestamptz`);
	return sql.join(clauses, sql` AND `);
};

// The filter fields in a fixed order, for the hash a cursor is bound to.
export const filterKey = (filter: TicketFilter) => [
	filter.rootIds ?? null,
	filter.projectIds ?? null,
	filter.statusIds ?? null,
	filter.categories ?? null,
	filter.reviewer ?? null,
	filter.priority ?? null,
	filter.labelIds ?? null,
	filter.labelNotIds ?? null,
	filter.noLabel ?? null,
	filter.parent ?? null,
	filter.waitsOn ?? null,
	filter.blocked ?? null,
	filter.epic ?? null,
	filter.wave ?? null,
	filter.pr ?? null,
	filter.ci ?? null,
	filter.actor ?? null,
	filter.q ?? null,
	filter.updated ?? null,
	filter.created ?? null,
	filter.completed ?? null,
];
