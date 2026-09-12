import type { ReviewPrSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { iso, rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import type { ServiceCtx } from "../support";
import { changed, ensurePr } from "./queries";

export async function open(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await ensurePr(tx, input.pr);
	await changed(ctx, tx, pr.id);
	return pr;
}
export async function prs(_ctx: ServiceCtx, tx: Tx, _input: Record<string, never>) {
	return rows<z.infer<typeof ReviewPrSchema>>(
		tx,
		sql`SELECT p.id, p.url, p.owner, p.repo, p.number, p.title, p.state,
		(SELECT count(*)::int FROM review_threads t WHERE t.pr_id = p.id AND t.document->>'status' = 'open') AS open,
		(SELECT count(*)::int FROM review_threads t WHERE t.pr_id = p.id AND t.document->>'status' = 'resolved') AS resolved,
		${iso(sql`COALESCE((SELECT max(t.updated_at) FROM review_threads t WHERE t.pr_id = p.id), p.updated_at)`)} AS "updatedAt"
		FROM pull_requests p WHERE p.review_retained ORDER BY "updatedAt" DESC`,
	);
}
