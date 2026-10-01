import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { readRetainedNativeAttemptIds } from "../../db/queries/langflowExecution/retainedNativeAttempts";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { withNativeSnapshotRetention } from "../langflowNative/withNativeSnapshotRetention";
import { withAttemptOperation } from "../langflowStops/withAttemptOperation";
import type { ServiceCtx } from "../support";
import { type AttemptDirectory, attemptsToRemove } from "./decide";

type AttemptSweepCtx = Pick<ServiceCtx, "home" | "newTx" | "now" | "log">;

const readAttemptReferences = async (tx: Tx) => {
	const current = await rows<{ terminalId: string }>(
		tx,
		sql`SELECT DISTINCT terminal_id AS "terminalId" FROM agent_runs WHERE terminal_id IS NOT NULL`,
	);
	const retained = await readRetainedNativeAttemptIds(tx);
	return new Set([...current.map((row) => row.terminalId), ...retained]);
};

const attemptReferenced = async (tx: Tx, id: string) => {
	const [row] = await rows<{ referenced: boolean }>(
		tx,
		sql`SELECT EXISTS(SELECT 1 FROM agent_runs WHERE terminal_id = ${id})
			OR EXISTS(SELECT 1 FROM langflow_native_handles WHERE attempt_id = ${id}) AS referenced`,
	);
	return row!.referenced;
};

export async function sweepAttempts(ctx: AttemptSweepCtx, attempts: AttemptDirectory[], minAgeMs: number) {
	let removed = 0;
	await withNativeSnapshotRetention(ctx.home, async () => {
		const started = performance.now();
		const references = await ctx.newTx(readAttemptReferences);
		const referenceReadMs = performance.now() - started;
		const candidates = attemptsToRemove(attempts, references, ctx.now().getTime(), minAgeMs).sort();
		ctx.log("sweep attempt candidates", {
			directories: attempts.length,
			candidates: candidates.length,
			referenceReadMs,
		});
		let checked = 0;
		let retained = 0;
		let lastReport = performance.now();
		let lastYield = lastReport;
		for (const id of candidates) {
			await withAttemptOperation(ctx.home, id, async () => {
				// A launch can assign this attempt while the sweep waits for its attempt lock.
				if (await ctx.newTx((tx) => attemptReferenced(tx, id))) {
					retained += 1;
					return;
				}
				await rm(join(ctx.home, "harness-attempts", id), { recursive: true, force: true });
				removed += 1;
			});
			checked += 1;
			const now = performance.now();
			if (now - lastReport >= 5_000) {
				ctx.log("sweep attempt progress", {
					candidates: candidates.length,
					checked,
					retained,
					removed,
					elapsedMs: now - started,
				});
				lastReport = now;
			}
			// PGlite can finish consecutive transactions before the worker handles messages or timers.
			if (now - lastYield >= 25) {
				await setImmediate();
				lastYield = performance.now();
			}
		}
		ctx.log("sweep attempts completed", {
			candidates: candidates.length,
			checked,
			retained,
			removed,
			elapsedMs: performance.now() - started,
		});
	});
	return removed;
}
