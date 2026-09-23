import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

// What an agent wrote when it said that no flow fits its change. One row per
// pull request and head commit, so a new push asks the agent again. `reason`
// is the sentence the person reads beside the pull request.
export const prFlowWaivers = pgTable(
	"pr_flow_waivers",
	{
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		headSha: text("head_sha").notNull(),
		reason: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "pr_flow_waivers_pkey", columns: [t.pullRequestId, t.headSha] }),
		actorFk("pr_flow_waivers_actor_fk", t),
		check("pr_flow_waivers_head_sha_check", sql`length(${t.headSha}) BETWEEN 1 AND 64`),
		check("pr_flow_waivers_reason_check", sql`length(${t.reason}) BETWEEN 1 AND 2000`),
	],
);
