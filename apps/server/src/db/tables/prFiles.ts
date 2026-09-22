import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

// A file that the summary or the evidence document of a pull request shows.
// The bytes live in the attachment store under `blob_sha256`.
export const prFiles = pgTable(
	"pr_files",
	{
		id: text().primaryKey(),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		blobSha256: text("blob_sha256").notNull(),
		filename: text().notNull(),
		mime: text().notNull(),
		size: bigint({ mode: "number" }).notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("pr_files_actor_fk", t),
		check("pr_files_blob_sha256_check", sql`${t.blobSha256} ~ '^[0-9a-f]{64}$'`),
		check("pr_files_size_check", sql`${t.size} >= 0`),
		index("pr_files_pull_request_id_idx").on(t.pullRequestId),
		index("pr_files_blob_sha256_idx").on(t.blobSha256),
	],
);
