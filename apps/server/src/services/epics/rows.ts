import type { EpicCounts, EpicState, EpicSummary, StoredActorKind } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso } from "../../db/queries/support.ts";

// One epic row with the columns of the wire, plus the root key for the ref
// and the ticket counts by status category.
export type RawEpic = {
	id: string;
	project_id: string;
	root_id: string;
	root_key: string;
	slug: string;
	name: string;
	description: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	total: number;
	todo: number;
	started: number;
	review: number;
	done: number;
	canceled: number;
	created_at: string;
	updated_at: string;
};

// The canonical ref of an epic: the root key and the slug, joined with a slash.
export const epicRefOf = (row: { root_key: string; slug: string }) => `${row.root_key}/${row.slug}`;

// `done` when the epic holds at least one ticket and every ticket is done or
// canceled. An epic with no ticket is open.
export const stateOf = (counts: EpicCounts): EpicState =>
	counts.total > 0 && counts.done + counts.canceled === counts.total ? "done" : "open";

const categoryCount = (category: string) => sql`(count(*) FILTER (WHERE s.category = ${category}))::int`;

// A lateral join with the alias `c`. It counts the tickets that match
// `where` by status category in one pass. `where` reads the ticket as `t`
// and names the outer row, so each outer row gets its own counts.
export const ticketCounts = (where: SQL) => sql`CROSS JOIN LATERAL (
		SELECT count(*)::int AS total,
			${categoryCount("todo")} AS todo,
			${categoryCount("started")} AS started,
			${categoryCount("review")} AS review,
			${categoryCount("done")} AS done,
			${categoryCount("canceled")} AS canceled
		FROM tickets t JOIN statuses s ON s.id = t.status_id WHERE ${where}
	) c`;

// The columns of `ticketCounts` as the wire shape.
export const toCounts = (row: EpicCounts): EpicCounts => ({
	total: row.total,
	todo: row.todo,
	started: row.started,
	review: row.review,
	done: row.done,
	canceled: row.canceled,
});

// `c` holds the counts of the tickets that point at the epic. An agent actor
// is `agent:<run id>`, and the run name is its display name.
export const epicSelect = sql`SELECT e.id, e.project_id, e.root_id, root.key AS root_key, e.slug, e.name, e.description,
	e.actor_name, e.actor_kind, ${actorDisplayName(sql`e.actor_name`, sql`e.actor_kind`)} AS actor_display_name,
	c.total, c.todo, c.started, c.review, c.done, c.canceled,
	${iso(sql`e.created_at`)} AS created_at, ${iso(sql`e.updated_at`)} AS updated_at
	FROM epics e
	JOIN projects root ON root.id = e.root_id
	${ticketCounts(sql`t.epic_id = e.id`)}`;

// Open epics first, done epics after them; inside a group the latest change
// comes first. The boolean is the `done` state, and false sorts before true.
export const epicOrder = sql`(c.total > 0 AND c.done + c.canceled = c.total), e.updated_at DESC, e.id DESC`;

export const toEpicSummary = (row: RawEpic, projectPath: string): EpicSummary => {
	const counts = toCounts(row);
	return {
		id: row.id,
		projectId: row.project_id,
		projectPath,
		ref: epicRefOf(row),
		slug: row.slug,
		name: row.name,
		description: row.description,
		counts,
		state: stateOf(counts),
		actor: {
			name: row.actor_name,
			kind: row.actor_kind,
			...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
		},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
};
