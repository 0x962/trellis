import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { pullRequests, tickets } from "../schema";
import { at } from "./actors";
import { agentRuns } from "./agentRuns.ts";
import { checkNotices } from "./checkNotices.ts";

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
// One row is one message that waits for the agent of one ticket. The message
// is a review submission, one comment a person wrote on a diff line, or one
// check notice, so exactly one of `review_id`, `thread_message_id` and
// `check_notice_id` holds an identifier. A comment row also names its
// thread, because the message to the agent carries the file and the line
// that the thread holds.
//
// `ticket_id` is the recipient. The agent run that receives the message is
// the open assignment of that ticket at the moment of the send, and
// `run_id` holds that run once `dispatchDeliveries` claims the row. A row
// whose ticket has no running agent stays in the state `held`, and the
// dispatcher sends it when a run of that ticket runs again. `ticket_id` is
// null on a row that the 0101 upgrade could not match to a ticket, and the
// upgrade gave every such row a final state.
//
// `due_at` is the first moment the dispatcher may send the row: a comment
// row sets it a few seconds ahead, so the comments a person writes one after
// another travel in one message. It is also the moment the message joined
// the queue, and `dispatchDeliveries` drops a message that waits a day.
//
// `author_name` and `author_kind` name the actor that wrote the message,
// and `author_run_id` names the agent run that wrote it when Trellis
// started that agent. A check notice and a merge notice have no author, so
// all three stay null. `dispatchDeliveries` reads these three columns to
// keep a message away from the agent that wrote it.
//
// The unique rule counts two null values as equal. A queued row holds no
// run, so the rule allows one queued row per message and ticket. A row that
// went to an agent holds that run and leaves the rule.
export const reviewDeliveries = pgTable(
	"review_deliveries",
	{
		id: text().primaryKey(),
		reviewId: text("review_id").references(() => reviewSubmissions.id),
		threadId: text("thread_id").references(() => reviewThreads.id, { onDelete: "cascade" }),
		threadMessageId: text("thread_message_id"),
		checkNoticeId: text("check_notice_id").references(() => checkNotices.id, { onDelete: "cascade" }),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
		runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
		authorName: text("author_name"),
		authorKind: text("author_kind"),
		authorRunId: text("author_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
		state: text().notNull().default("pending"),
		error: text(),
		readAt: at("read_at"),
		dueAt: at("due_at").notNull().defaultNow(),
		attempt: integer().notNull().default(0),
	},
	(t) => [
		unique("review_deliveries_recipient")
			.on(t.reviewId, t.threadMessageId, t.checkNoticeId, t.ticketId, t.runId)
			.nullsNotDistinct(),
		index("review_deliveries_state_idx").on(t.state),
		check(
			"review_deliveries_one_source",
			sql`num_nonnulls(${t.reviewId}, ${t.threadMessageId}, ${t.checkNoticeId}) = 1`,
		),
	],
);
