import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { CI_STATES, checkIn, PR_LINK_SOURCES, PR_STATES, PRIORITIES, REVIEW_STATES } from "./enums.ts";
import { actorColumns, actorFk, at } from "./tables/actors.ts";
import { projects, statuses } from "./tables/projects.ts";

export * from "./tables/actors.ts";
export * from "./tables/agentRuns.ts";
export * from "./tables/agents.ts";
export * from "./tables/controller.ts";
export * from "./tables/flows.ts";
export * from "./tables/personas.ts";
export * from "./tables/projects.ts";
export * from "./tables/reviews.ts";

// drizzle-kit reads this file and every table it exports. Each table is
// text plus a named CHECK where the wire has a closed set. The migration
// 0002_constraints holds what drizzle-kit cannot render: the UNIQUE NULLS
// NOT DISTINCT constraint on projects, the generated tsvector columns on
// tickets and comments, and the trigram index on tickets.title.

// root_id repeats the project's root so the composite foreign keys keep a
// ticket, its project, and its parent inside one root. The status foreign
// key accepts any status; the owner rule is checked in the service. Each
// foreign key is RESTRICT: the delete of a row a ticket still points at
// fails at once, inside the statement that deletes it.
// The generated column `search` (title at weight A, description at weight
// B) and its GIN index live in the migration 0002_constraints, because
// drizzle-kit renders no generated tsvector. The GIN index on title with
// gin_trgm_ops lives in the migration 0002_constraints too, because
// drizzle-kit renders no operator class.
export const tickets = pgTable(
	"tickets",
	{
		id: text().primaryKey(),
		projectId: text("project_id").notNull(),
		rootId: text("root_id").notNull(),
		number: integer().notNull(),
		title: text().notNull(),
		description: text().notNull().default(""),
		priority: text().notNull().default("none"),
		statusId: text("status_id")
			.notNull()
			.references(() => statuses.id, { onDelete: "restrict" }),
		parentId: text("parent_id"),
		position: doublePrecision().notNull(),
		version: integer().notNull().default(1),
		startedAt: at("started_at"),
		completedAt: at("completed_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("tickets_root_id_number_unique").on(t.rootId, t.number),
		unique("tickets_id_root_id_unique").on(t.id, t.rootId),
		foreignKey({
			name: "tickets_project_fk",
			columns: [t.projectId, t.rootId],
			foreignColumns: [projects.id, projects.rootId],
		}).onDelete("restrict"),
		foreignKey({
			name: "tickets_parent_fk",
			columns: [t.parentId, t.rootId],
			foreignColumns: [t.id, t.rootId],
		}).onDelete("restrict"),
		check("tickets_parent_not_self", sql`${t.parentId} <> ${t.id}`),
		check("tickets_number_check", sql`${t.number} > 0`),
		check("tickets_title_check", sql`${t.title} = btrim(${t.title}) AND length(${t.title}) BETWEEN 1 AND 500`),
		checkIn(t.priority, PRIORITIES),
		index("tickets_project_id_status_id_position_idx").on(t.projectId, t.statusId, t.position),
		// The `position` sort reads a status in (position, id) order and
		// filters it by project and root. Every column it reads is in this
		// index, so it is read from the index alone, with no table row.
		index("tickets_status_id_position_id_idx").on(t.statusId, t.position, t.id, t.projectId, t.rootId),
		// A board column reads its tickets in (updated_at desc, id desc) order
		// and filters them by project and root. Every column it reads is in
		// this index, so the column is read from the index alone.
		index("tickets_status_id_updated_at_id_idx").on(
			t.statusId,
			t.updatedAt.desc().nullsFirst(),
			t.id.desc().nullsFirst(),
			t.projectId,
			t.rootId,
		),
		index("tickets_parent_id_idx").on(t.parentId),
		index("tickets_open_idx").on(t.rootId, t.updatedAt.desc().nullsFirst()).where(sql`${t.completedAt} IS NULL`),
		index("tickets_completed_idx")
			.on(t.rootId, t.completedAt.desc().nullsFirst())
			.where(sql`${t.completedAt} IS NOT NULL`),
	],
);

// The generated column `search` (body at weight C) and its GIN index live in
// the migration 0002_constraints: drizzle-kit renders neither.
export const comments = pgTable(
	"comments",
	{
		id: text().primaryKey(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		body: text().notNull(),
		dedupeKey: text("dedupe_key"),
		parentId: text("parent_id"),
		resolvedAt: at("resolved_at"),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("comments_actor_fk", t),
		unique("comments_id_ticket_id_unique").on(t.id, t.ticketId),
		unique("comments_dedupe_unique").on(t.ticketId, t.actorKind, t.actorName, t.dedupeKey),
		foreignKey({
			name: "comments_parent_fk",
			columns: [t.parentId, t.ticketId],
			foreignColumns: [t.id, t.ticketId],
		}).onDelete("cascade"),
		check("comments_parent_check", sql`${t.parentId} <> ${t.id}`),
		check("comments_resolved_root_check", sql`${t.parentId} IS NULL OR ${t.resolvedAt} IS NULL`),
		index("comments_parent_id_idx").on(t.parentId),
		check("comments_body_check", sql`length(${t.body}) BETWEEN 1 AND 200000`),
		index("comments_ticket_id_created_at_idx").on(t.ticketId, t.createdAt),
	],
);

// The blob path is a function of sha256, so two rows may share one blob.
export const attachments = pgTable(
	"attachments",
	{
		id: text().primaryKey(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		filename: text().notNull(),
		mime: text().notNull(),
		size: bigint({ mode: "number" }).notNull(),
		sha256: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("attachments_actor_fk", t),
		check(
			"attachments_filename_check",
			sql`length(${t.filename}) BETWEEN 1 AND 255 AND position('/' IN ${t.filename}) = 0`,
		),
		check("attachments_size_check", sql`${t.size} > 0`),
		check("attachments_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
		index("attachments_ticket_id_idx").on(t.ticketId),
		index("attachments_sha256_idx").on(t.sha256),
	],
);

// `checks` is the sorted list of `{name, workflow, bucket, link}` gh reported.
export const pullRequests = pgTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		owner: text().notNull(),
		repo: text().notNull(),
		number: integer().notNull(),
		url: text().notNull(),
		title: text().notNull().default(""),
		state: text().notNull(),
		isDraft: boolean("is_draft").notNull().default(false),
		reviewRetained: boolean("review_retained").notNull().default(false),
		headRef: text("head_ref").notNull().default(""),
		baseRef: text("base_ref").notNull().default(""),
		reviewState: text("review_state").notNull().default("none"),
		mergedAt: at("merged_at"),
		closedAt: at("closed_at"),
		checks: jsonb().notNull().default([]),
		ciState: text("ci_state").notNull().default("none"),
		contentHash: text("content_hash"),
		fetchedAt: at("fetched_at"),
		fetchError: text("fetch_error"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("pull_requests_owner_repo_number_unique").on(t.owner, t.repo, t.number),
		check("pull_requests_owner_check", sql`${t.owner} = lower(${t.owner}) AND length(${t.owner}) > 0`),
		check("pull_requests_repo_check", sql`${t.repo} = lower(${t.repo}) AND length(${t.repo}) > 0`),
		check("pull_requests_number_check", sql`${t.number} > 0`),
		checkIn(t.state, PR_STATES),
		checkIn(t.reviewState, REVIEW_STATES),
		checkIn(t.ciState, CI_STATES),
		check("pull_requests_checks_check", sql`jsonb_typeof(${t.checks}) = 'array'`),
		index("pull_requests_state_ci_state_idx").on(t.state, t.ciState),
	],
);

export const ticketPullRequests = pgTable(
	"ticket_pull_requests",
	{
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		source: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "ticket_pull_requests_pkey", columns: [t.ticketId, t.pullRequestId] }),
		actorFk("ticket_pull_requests_actor_fk", t),
		checkIn(t.source, PR_LINK_SOURCES),
		index("ticket_pull_requests_pull_request_id_idx").on(t.pullRequestId),
	],
);

// The identity id is the cursor and the sort key of every activity feed.
// A description row records that the text changed and `meta.deltaChars`;
// the old and new text stay out of the table.
export const activity = pgTable(
	"activity",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		batchId: text("batch_id").notNull(),
		rootId: text("root_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
		...actorColumns(),
		action: text().notNull(),
		field: text(),
		fromValue: text("from_value"),
		toValue: text("to_value"),
		meta: jsonb().notNull().default({}),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("activity_actor_fk", t),
		check(
			"activity_description_check",
			sql`${t.field} <> 'description' OR (${t.fromValue} IS NULL AND ${t.toValue} IS NULL)`,
		),
		index("activity_ticket_id_id_idx").on(t.ticketId, t.id),
		// The last actor of a ticket is its newest row by (created_at, id). This
		// index finds that row with one index entry.
		index("activity_ticket_id_created_at_id_idx").on(
			t.ticketId,
			t.createdAt.desc().nullsFirst(),
			t.id.desc().nullsFirst(),
		),
		index("activity_root_id_id_idx").on(t.rootId, t.id),
		index("activity_project_id_id_idx").on(t.projectId, t.id),
		index("activity_created_at_idx").on(t.createdAt),
	],
);

export * from "./tables/assignments.ts";
export * from "./tables/commentDeliveries.ts";
export * from "./tables/evidence.ts";
export * from "./tables/flowExecutions.ts";
export * from "./tables/flowExecutionTasks.ts";
export * from "./tables/managerNextActions.ts";
export * from "./tables/nativeMigrations.ts";
