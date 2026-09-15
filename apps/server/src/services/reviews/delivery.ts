import { ORPCError } from "@orpc/server";
import { reviewHref } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { prepareSend } from "../agentRuns/communication";
import { notFound, type ServiceCtx } from "../support";
import { changed } from "./queries";
import { show } from "./submissions";

type Ctx = ServiceCtx & { publicUrl: string };
export async function preparePending(ctx: Ctx) {
	const ids = await ctx.newTx((tx) =>
		rows<{ id: string }>(tx, sql`SELECT id FROM review_deliveries WHERE state = 'pending' ORDER BY id LIMIT 20`),
	);
	for (const { id } of ids) {
		const [delivery] = await ctx.newTx((tx) =>
			rows<{ review_id: string; run_id: string }>(
				tx,
				sql`UPDATE review_deliveries SET state = 'sending', attempt = attempt + 1 WHERE id = ${id} AND state = 'pending' RETURNING review_id, run_id`,
			),
		);
		if (!delivery) continue;
		const review = await ctx.newTx((tx) => show(ctx, tx, { id: delivery.review_id }));
		const text = `trellis: Review ${review.id} submitted by ${review.author}: ${review.verdict}. ${review.threads.filter((t) => t.status === "open").length} open findings. ${ctx.publicUrl}${reviewHref(review.url)}\nRead: trellis review show ${review.id} --json\nRead existing threads before work. Reply to each finding and resolve only addressed threads. Acknowledge: trellis review read ${review.id} --run ${delivery.run_id}`;
		let state = "sent";
		let error: string | null = null;
		try {
			await prepareSend(ctx, { id: delivery.run_id, text });
		} catch (cause) {
			state = "failed";
			error =
				cause instanceof ORPCError && cause.code === "INPUT_VALIDATION_FAILED"
					? (cause.data as { issues: { message: string }[] }).issues.map((issue) => issue.message).join(" ")
					: cause instanceof Error
						? cause.message
						: String(cause);
		}
		await ctx.newTx(async (tx) => {
			await tx.execute(sql`UPDATE review_deliveries SET state = ${state}, error = ${error} WHERE id = ${id}`);
			await changed(ctx, tx, review.prId);
		});
	}
	return {};
}
export const finished = (_ctx: ServiceCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
export async function resend(ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const [row] = await rows<{ review_id: string }>(
		tx,
		sql`UPDATE review_deliveries SET state = 'pending', error = NULL WHERE id = ${input.id} AND state IN ('failed', 'unknown') RETURNING review_id`,
	);
	if (!row) throw notFound("failedReviewDelivery", input.id);
	const review = await show(ctx, tx, { id: row.review_id });
	await changed(ctx, tx, review.prId);
	return review;
}
