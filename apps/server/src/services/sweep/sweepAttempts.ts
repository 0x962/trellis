import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { workspaceOperation } from "../../agents/native/workspaceOperation";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { attemptRetention } from "../attemptRetention";
import type { ServiceCtx } from "../support";
import { type AttemptDirectory, attemptsToRemove } from "./decide";

type AttemptSweepCtx = Pick<ServiceCtx, "home" | "newTx" | "now" | "log">;

const readAttemptReferences = async (tx: Tx) => {
	const current = await rows<{ terminalId: string }>(
		tx,
		sql`SELECT DISTINCT terminal_id AS "terminalId" FROM agent_runs WHERE terminal_id IS NOT NULL`,
	);
	const retained = await rows<{ terminalId: string }>(
		tx,
		sql`SELECT attempt_id AS "terminalId" FROM langflow_native_handles`,
	);
	return new Set([...current, ...retained].map((row) => row.terminalId));
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
	await workspaceOperation(join(ctx.home, "harness-attempts"), async () => {
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
			await workspaceOperation(join(ctx.home, "harness-attempts", id), async () => {
				// A launch can assign this attempt while the sweep waits for its attempt lock.
				if (attemptRetention.has(ctx.home, id) || (await ctx.newTx((tx) => attemptReferenced(tx, id)))) {
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
