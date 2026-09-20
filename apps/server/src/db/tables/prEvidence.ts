import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { checkIn, EVIDENCE_KINDS } from "../enums.ts";
import { actorColumns, actorFk, at } from "./actors.ts";
import { pullRequests } from "./pullRequests.ts";

export const prEvidence = pgTable(
	"pr_evidence",
	{
		id: text().primaryKey(),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		headSha: text("head_sha").notNull(),
		kind: text().notNull(),
		record: jsonb().notNull(),
		blobSha256: text("blob_sha256"),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("pr_evidence_actor_fk", t),
		checkIn(t.kind, EVIDENCE_KINDS),
		check("pr_evidence_record_check", sql`jsonb_typeof(${t.record}) = 'object'`),
		check("pr_evidence_head_sha_check", sql`length(${t.headSha}) BETWEEN 1 AND 64`),
		check("pr_evidence_blob_sha256_check", sql`${t.blobSha256} IS NULL OR ${t.blobSha256} ~ '^[0-9a-f]{64}$'`),
		index("pr_evidence_pr_head_kind_created_idx").on(t.pullRequestId, t.headSha, t.kind, t.createdAt),
		index("pr_evidence_blob_sha256_idx").on(t.blobSha256),
	],
);
