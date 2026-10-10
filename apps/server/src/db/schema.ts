export * from "./tables/chatterMessages";
export * from "./tables/epicChatterSettings";
export * from "./tables/epicWhiteboards";
export * from "./tables/hosts";
export * from "./tables/tickets";

import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { checkIn, PR_LINK_SOURCES } from "./enums.ts";
import { actorColumns, actorFk, at } from "./tables/actors.ts";
import { projects } from "./tables/projects.ts";
import { pullRequests } from "./tables/pullRequests.ts";
import { tickets } from "./tables/tickets/index.ts";

export * from "./tables/actors.ts";
export * from "./tables/agentRuns.ts";
export * from "./tables/checkNotices.ts";
export * from "./tables/epicResources.ts";
export * from "./tables/epics.ts";
export * from "./tables/flows.ts";
export * from "./tables/labels.ts";
export * from "./tables/pageAssets.ts";
export * from "./tables/pageComments.ts";
export * from "./tables/pagePins.ts";
export * from "./tables/pages.ts";
export * from "./tables/pageUploads.ts";
export * from "./tables/pageVersions.ts";
export * from "./tables/pageWatches.ts";
export * from "./tables/prEvidence.ts";
export * from "./tables/prEvidenceDocuments.ts";
export * from "./tables/prFiles.ts";
export * from "./tables/prFlowWaivers.ts";
export * from "./tables/projects.ts";
export * from "./tables/providers.ts";
export * from "./tables/prSummaries.ts";
export * from "./tables/pullRequests.ts";
export * from "./tables/resourceComments.ts";
export * from "./tables/reviews.ts";
export * from "./tables/sessionObservers/index.ts";
export * from "./tables/sessions.ts";
export * from "./tables/sessionUpdates.ts";
export * from "./tables/ticketDeps.ts";
export * from "./tables/waves.ts";

// drizzle-kit reads this file and every table it exports. Each table is
// text plus a named CHECK where the wire has a closed set. The migration
// 0002_constraints holds what drizzle-kit cannot render: the UNIQUE NULLS
// NOT DISTINCT constraint on projects, the generated tsvector columns on
// tickets and comments, and the trigram index on tickets.title.

// The ticket comments of an earlier version of trellis. No code reads or
// writes this table; it keeps the stored rows. The generated column `search`
// (body at weight C) and its GIN index live in the migration
// 0002_constraints: drizzle-kit renders neither.
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
		unique("comments_dedupe_unique").on(t.ticketId, t.actorId, t.dedupeKey),
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
		check("attachments_filename_check", sql`length(${t.filename}) >= 1 AND position('/' IN ${t.filename}) = 0`),
		check("attachments_size_check", sql`${t.size} > 0`),
		check("attachments_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
		index("attachments_ticket_id_idx").on(t.ticketId),
		index("attachments_sha256_idx").on(t.sha256),
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
// A private ticket field records only that the value changed. The old and
// new values stay out of the table. A description change stores its size in
// `meta.deltaChars`.
export const activity = pgTable(
	"activity",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		batchId: text("batch_id").notNull(),
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
			"activity_private_values_check",
			sql`${t.field} NOT IN ('description', 'result', 'outcome') OR (${t.fromValue} IS NULL AND ${t.toValue} IS NULL)`,
		),
		index("activity_ticket_id_id_idx").on(t.ticketId, t.id),
		// The last actor of a ticket is its newest row by (created_at, id). This
		// index finds that row with one index entry.
		index("activity_ticket_id_created_at_id_idx").on(
			t.ticketId,
			t.createdAt.desc().nullsFirst(),
			t.id.desc().nullsFirst(),
		),
		index("activity_project_id_id_idx").on(t.projectId, t.id),
		index("activity_created_at_idx").on(t.createdAt),
	],
);

export * from "./tables/assignments.ts";
export * from "./tables/commentDeliveries.ts";
export * from "./tables/flowExecutions.ts";
export * from "./tables/flowExecutionTasks.ts";
export * from "./tables/harnessAccounts.ts";
export {
	langflowDocumentActions,
	langflowDocumentConversions,
	langflowDocumentPublicationStates,
	langflowDocumentPublications,
	langflowDocumentRevisions,
	langflowDocumentSaveReceipts,
} from "./tables/langflowDocuments/index.ts";
export * from "./tables/langflowExecution/index.ts";
export * from "./tables/nativeMigrations.ts";
export * from "./tables/notes.ts";
export * from "./tables/roles.ts";
