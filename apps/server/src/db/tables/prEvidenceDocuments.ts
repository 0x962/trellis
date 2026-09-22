import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

// One Markdown evidence document per pull request. A new write replaces the
// body and `head_sha`, and keeps `created_at`.
export const prEvidenceDocuments = pgTable(
	"pr_evidence_documents",
	{
		pullRequestId: text("pull_request_id")
			.primaryKey()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		headSha: text("head_sha").notNull(),
		body: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("pr_evidence_documents_actor_fk", t),
		check("pr_evidence_documents_head_sha_check", sql`length(${t.headSha}) BETWEEN 1 AND 64`),
	],
);
