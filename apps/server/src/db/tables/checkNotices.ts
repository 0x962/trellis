import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { checkIn } from "../enums.ts";
import { at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

// `conflict` and `clear` tell about the merge state of the pull request, and
// the other kinds tell about its checks. The two families never replace each
// other: `decideNotice` reads the check kinds, and `decideConflictNotice`
// reads the merge kinds.
export const CONFLICT_NOTICE_KINDS = ["conflict", "clear"] as const;
export const CHECK_NOTICE_KINDS = ["failed", "passed", "stuck", ...CONFLICT_NOTICE_KINDS] as const;

// One row is one change in the GitHub checks or the merge state of a pull
// request that the agents of its tickets must hear about. `head_sha` is the commit the checks
// ran on. `checks` lists the checks the message names, each as
// `{name, workflow, link, lines}`, where `lines` holds the first lines of
// the failure output that GitHub gave. The poller writes the rows, and a
// row that exists is never written again, so a restart sends nothing twice.
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
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		checkIn(t.kind, CHECK_NOTICE_KINDS),
		check("check_notices_checks_check", sql`jsonb_typeof(${t.checks}) = 'array'`),
		index("check_notices_pr_created").on(t.prId, t.createdAt),
	],
);
