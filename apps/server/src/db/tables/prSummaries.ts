import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

export const prSummaries = pgTable(
	"pr_summaries",
	{
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		headSha: text("head_sha").notNull(),
		headline: text().notNull(),
		why: text().notNull(),
		watch: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [primaryKey({ name: "pr_summaries_pkey", columns: [t.pullRequestId, t.headSha] })],
);
