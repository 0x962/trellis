import type { ReviewDelivery, ReviewSubmission } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { notFound, type ServiceCtx } from "../support";
import { findPr } from "./queries";

export async function deliveryRows(tx: Tx, id: string) {
	return rows<ReviewDelivery>(
		tx,
		sql`SELECT id, review_id AS "reviewId", run_id AS "runId", state, error, to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt" FROM review_deliveries WHERE review_id = ${id} ORDER BY id`,
	);
}
export async function show(_ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<ReviewSubmission> {
	const [row] = await rows<{ document: ReviewSubmission }>(
		tx,
		sql`SELECT document FROM review_submissions WHERE id = ${input.id}`,
	);
	if (!row) throw notFound("review", input.id);
	return { ...row.document, deliveries: await deliveryRows(tx, input.id) };
}
export async function history(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await findPr(tx, input.pr);
	if (!pr) return [];
	const ids = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM review_submissions WHERE pr_id = ${pr.id} ORDER BY created_at DESC`,
	);
	const result = [];
	for (const id of ids) result.push(await show(ctx, tx, id));
	return result;
}
