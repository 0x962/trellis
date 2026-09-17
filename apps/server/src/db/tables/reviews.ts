import { index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { pullRequests } from "../schema";
import { at } from "./actors";

export const reviewRevisions = pgTable(
	"review_revisions",
	{
		id: text().primaryKey(),
		prId: text("pr_id")
			.notNull()
			.references(() => pullRequests.id),
		baseSha: text("base_sha").notNull(),
		headSha: text("head_sha").notNull(),
		document: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [unique("review_revisions_commit_pair").on(t.prId, t.baseSha, t.headSha)],
);
export const reviewThreads = pgTable(
	"review_threads",
	{
		id: text().primaryKey(),
		prId: text("pr_id")
			.notNull()
			.references(() => pullRequests.id),
		revisionId: text("revision_id").references(() => reviewRevisions.id),
		document: jsonb().notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [index("review_threads_pr_updated").on(t.prId, t.updatedAt)],
);
export const reviewSubmissions = pgTable(
	"review_submissions",
	{
		id: text().primaryKey(),
		prId: text("pr_id")
			.notNull()
			.references(() => pullRequests.id),
		requestId: text("request_id").notNull(),
		actor: text().notNull(),
		document: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [unique("review_submissions_request").on(t.prId, t.actor, t.requestId)],
);
export const reviewDeliveries = pgTable(
	"review_deliveries",
	{
		id: text().primaryKey(),
		reviewId: text("review_id")
			.notNull()
			.references(() => reviewSubmissions.id),
		runId: text("run_id").notNull(),
		state: text().notNull().default("pending"),
		error: text(),
		readAt: at("read_at"),
		attempt: integer().notNull().default(0),
	},
	(t) => [unique("review_deliveries_recipient").on(t.reviewId, t.runId)],
);
