import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { CI_STATES, checkIn, LOCAL_PR_STATES, MERGEABLE_STATES, PR_STATES, REVIEW_STATES } from "../enums.ts";
import { at } from "./actors.ts";

// `checks` is the sorted list of `{name, workflow, bucket, link}` gh reported.
export const pullRequests = pgTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		owner: text().notNull(),
		repo: text().notNull(),
		number: integer().notNull(),
		additions: integer(),
		deletions: integer(),
		changedFiles: integer("changed_files"),
		// GitHub caps pullRequests.files at 100 rows. changedFiles holds the total, including rows beyond that cap.
		files: jsonb(),
		url: text().notNull(),
		title: text().notNull().default(""),
		state: text().notNull(),
		isDraft: boolean("is_draft").notNull().default(false),
		isQueued: boolean("is_queued").notNull().default(false),
		// Whether the agent asked the person to review this pull request. The
		// link of an agent writes `not-ready`; `trellis ready` writes `ready`.
		// It is one part of being ready for review; `reviewGaps` in
		// `packages/api` holds the whole rule.
		localState: text("local_state").notNull().default("ready"),
		// The moment the state became `ready`, which is the moment the wait of
		// the person started. A new head commit clears it, because the person
		// then waits for nothing. A row written before this column existed
		// holds null.
		readyForReviewAt: at("ready_for_review_at"),
		reviewRetained: boolean("review_retained").notNull().default(false),
		headSha: text("head_sha"),
		headRef: text("head_ref").notNull().default(""),
		baseRef: text("base_ref").notNull().default(""),
		mergeable: text().notNull().default("unknown"),
		reviewState: text("review_state").notNull().default("none"),
		mergedAt: at("merged_at"),
		closedAt: at("closed_at"),
		checks: jsonb().notNull().default([]),
		// The last time a write changed `checks` or `head_sha`. A row that no
		// write changed since this column exists holds null, and the check
		// notice detector skips it, so old check results reach no agent.
		checksChangedAt: at("checks_changed_at"),
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
		checkIn(t.localState, LOCAL_PR_STATES),
		checkIn(t.ciState, CI_STATES),
		checkIn(t.mergeable, MERGEABLE_STATES),
		check("pull_requests_checks_check", sql`jsonb_typeof(${t.checks}) = 'array'`),
		check("pull_requests_files_check", sql`${t.files} IS NULL OR jsonb_typeof(${t.files}) = 'array'`),
		index("pull_requests_state_ci_state_idx").on(t.state, t.ciState),
	],
);
