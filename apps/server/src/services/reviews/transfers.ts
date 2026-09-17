import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import type { ServiceCtx } from "../support";
import { findPr } from "./queries";
import { history } from "./submissions";
export async function exportReview(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await findPr(tx, input.pr);
	const threads = await rows<{ document: ReviewThread }>(
		tx,
		sql`SELECT document FROM review_threads WHERE pr_id = ${pr?.id ?? ""} ORDER BY id`,
	);
	const revisions = await rows<{ document: ReviewRevision }>(
		tx,
		sql`SELECT document FROM review_revisions WHERE pr_id = ${pr?.id ?? ""} ORDER BY id`,
	);
	return {
		version: 1 as const,
		url: pr?.url ?? input.pr,
		threads: threads.map((r) => r.document),
		revisions: revisions.map((r) => r.document),
		submissions: await history(ctx, tx, input),
	};
}
