import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { readRetainedNativeAttemptIds } from "../../db/queries/langflowExecution/retainedNativeAttempts";
import { rows } from "../../db/queries/support";
import { withNativeSnapshotRetention } from "../langflowNative/withNativeSnapshotRetention";
import { withAttemptOperation } from "../langflowStops/withAttemptOperation";
import type { ServiceCtx } from "../support";
import { type AttemptDirectory, attemptsToRemove } from "./decide";

type AttemptSweepCtx = Pick<ServiceCtx, "home" | "newTx" | "now">;

const readAttemptReferences = (ctx: Pick<AttemptSweepCtx, "newTx">) =>
	ctx.newTx(async (tx) => {
		const current = await rows<{ terminalId: string }>(
			tx,
			sql`SELECT DISTINCT terminal_id AS "terminalId" FROM agent_runs WHERE terminal_id IS NOT NULL`,
		);
		return {
			current: new Set(current.map((row) => row.terminalId)),
			retained: await readRetainedNativeAttemptIds(tx),
		};
	});

export async function sweepAttempts(ctx: AttemptSweepCtx, attempts: AttemptDirectory[], minAgeMs: number) {
	let removed = 0;
	await withNativeSnapshotRetention(ctx.home, async () => {
		const candidates = attemptsToRemove(attempts, new Set(), ctx.now().getTime(), minAgeMs).sort();
		for (const id of candidates) {
			await withAttemptOperation(ctx.home, id, async () => {
				const references = await readAttemptReferences(ctx);
				if (references.current.has(id) || references.retained.has(id)) return;
				await rm(join(ctx.home, "harness-attempts", id), { recursive: true, force: true });
				removed += 1;
			});
		}
	});
	return removed;
}
