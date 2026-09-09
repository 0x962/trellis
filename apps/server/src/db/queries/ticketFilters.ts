import type { CiState, PrFilter, Priority, Reviewer, StatusCategory } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { tsquery } from "./fts.ts";
import { ciRank, textArray } from "./support.ts";

// The flat filter grammar of tickets.list, with every ref already resolved
// to an id. `parent` is a ticket id or `none` for top-level tickets.
// `actor` is `kind:name` or a bare name and matches the last actor.
// `updated`, `created`, and `completed` are ISO "after" bounds.
export type TicketFilter = {
	projectIds?: readonly string[];
	statusIds?: readonly string[];
	categories?: readonly StatusCategory[];
	reviewer?: Reviewer;
	priority?: readonly Priority[];
	parent?: string;
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

const prClause = (pr: PrFilter): SQL => {
	switch (pr) {
		case "any":
			return linked(sql`true`);
		case "none":
			return sql`NOT ${linked(sql`true`)}`;
		case "open":
			return linked(sql`p.state = 'open' AND NOT p.is_draft`);
		case "draft":
			return linked(sql`p.state = 'open' AND p.is_draft`);
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

// The WHERE clause of a ticket query over the aliases `t` (tickets) and `s`
// (the ticket's status). `q` matches the FTS column only; the trigram path
// belongs to search.
export const filterWhere = (filter: TicketFilter): SQL => {
	const clauses: SQL[] = [sql`true`];
	if (filter.projectIds) clauses.push(sql`t.project_id = ANY(${textArray(filter.projectIds)})`);
	if (filter.statusIds) clauses.push(sql`t.status_id = ANY(${textArray(filter.statusIds)})`);
	if (filter.categories) clauses.push(sql`s.category = ANY(${textArray(filter.categories)})`);
	if (filter.reviewer) clauses.push(sql`s.reviewer = ${filter.reviewer}`);
	if (filter.priority) clauses.push(sql`t.priority = ANY(${textArray(filter.priority)})`);
	if (filter.parent === "none") clauses.push(sql`t.parent_id IS NULL`);
	else if (filter.parent) clauses.push(sql`t.parent_id = ${filter.parent}`);
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
	filter.projectIds ?? null,
	filter.statusIds ?? null,
	filter.categories ?? null,
	filter.reviewer ?? null,
	filter.priority ?? null,
	filter.parent ?? null,
	filter.pr ?? null,
	filter.ci ?? null,
	filter.actor ?? null,
	filter.q ?? null,
	filter.updated ?? null,
	filter.created ?? null,
	filter.completed ?? null,
];
