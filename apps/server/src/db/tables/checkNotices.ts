import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { checkIn } from "../enums.ts";
import { at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

// Each kind belongs to the checks, merge conflict, or merge queue family.
// A decision function reads only the kinds in its family.
export const CONFLICT_NOTICE_KINDS = ["conflict", "clear"] as const;
export const QUEUE_NOTICE_KINDS = ["queued", "dequeued", "merged"] as const;
export const CHECK_NOTICE_KINDS = [
	"failed",
	"passed",
	"stuck",
	...CONFLICT_NOTICE_KINDS,
	...QUEUE_NOTICE_KINDS,
] as const;

// One row is one change in the GitHub checks, merge conflict, or merge queue
// state that the agents of its tickets must hear about. `head_sha` is the
// commit that the notice describes. `checks` lists the checks the message names, each as
// `{name, workflow, link, lines}`, where `lines` holds the first lines of
// the failure output that GitHub gave. A queue notice uses an empty list.
// `is_queued` and `queue_position` keep the queue state at the notice time.
// The poller writes the rows once, so a restart sends nothing twice.
export const checkNotices = pgTable(
	"check_notices",
	{
		id: text().primaryKey(),
		prId: text("pr_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		headSha: text("head_sha").notNull(),
		kind: text().notNull(),
		checks: jsonb().notNull(),
		isQueued: boolean("is_queued").notNull().default(false),
		queuePosition: integer("queue_position"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		checkIn(t.kind, CHECK_NOTICE_KINDS),
		check("check_notices_checks_check", sql`jsonb_typeof(${t.checks}) = 'array'`),
		index("check_notices_pr_created").on(t.prId, t.createdAt),
	],
);
