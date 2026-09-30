import { defaultSessionCleanup, SESSION_DAY_MS } from "@trellis/api";
import { sql } from "drizzle-orm";
import { tryHoldSession } from "../../../agents/sessionOperation";
import { attemptStopped } from "../../agentRuns/attemptCapture.ts";
import { projectRun } from "../../agentRuns/liveState.ts";
import { getRun } from "../../agentRuns/queries.ts";
import { latestAttemptActivityByRuns } from "../../assignments.ts";
import { removeSessionObserverWorkspace } from "../../sessionObserverHarness";
import { get as getSettings } from "../../settings";
import type { IoCtx } from "../../support.ts";
import { openPaths } from "../../sweep/openPaths.ts";
import { sessionProcess } from "../process.ts";
import { getSession } from "../queries.ts";
import { cleanupCandidates } from "./cleanupCandidates";
import { removeCleanDirectory } from "./removeCleanDirectory";

const expired = (days: number | null, age: number) => days !== null && age >= days * SESSION_DAY_MS;

export async function cleanup(
	ctx: IoCtx,
	_input: Record<string, never>,
	deps = {
		process: sessionProcess,
		removeObserver: removeSessionObserverWorkspace,
		removeDirectory: removeCleanDirectory,
		openPaths,
	},
) {
	const policy = (await ctx.newTx((tx) => getSettings(ctx.core, tx))).sessionCleanup ?? defaultSessionCleanup;
	const periods = [policy.archiveAfterDays, policy.deleteAfterDays].filter((days): days is number => days !== null);
	const result = { archived: 0, deleted: 0, skipped: 0 };
	if (periods.length === 0) return result;
	const candidates = await ctx.newTx((tx) =>
		cleanupCandidates(tx, { now: ctx.now(), minimumAgeMs: Math.min(...periods) * SESSION_DAY_MS }),
	);
	let heldPaths: string[] | undefined;
	for (const candidate of candidates) {
		const release = tryHoldSession(ctx.home, candidate.runId);
		if (release === null) {
			result.skipped++;
			continue;
		}
		try {
			const { session, run, settings, attempts } = await ctx.newTx(async (tx) => ({
				session: await getSession(tx, candidate.id),
				run: await getRun(tx, candidate.runId),
				settings: await getSettings(ctx.core, tx),
				attempts: await latestAttemptActivityByRuns(tx, [candidate.runId]),
			}));
			if (run.kind !== "session" || run.ticketId !== null || run.pinnedAt !== null) {
				result.skipped++;
				continue;
			}
			const process = await deps.process(ctx, run.terminalId);
			if (
				(process !== null && process.status !== "exited") ||
				(process === null && run.terminalId !== null && !(await attemptStopped(ctx.home, run.id, run.terminalId)))
			) {
				result.skipped++;
				continue;
			}
			const observed = projectRun(run, process === null ? [] : [process], ctx.home);
			const activityAt = Math.max(
				Date.parse(observed.activityAt ?? run.createdAt),
				Date.parse(session.updatedAt),
				...attempts.map((attempt) => Date.parse(attempt.activityAt)),
			);
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET activity_at = GREATEST(activity_at, ${new Date(activityAt)}::timestamptz) WHERE id = ${run.id}`,
				),
			);
			const age = ctx.now().getTime() - activityAt;
			const current = settings.sessionCleanup ?? defaultSessionCleanup;
			let deleted = false;
			if (expired(current.deleteAfterDays, age)) {
				heldPaths ??= await deps.openPaths();
				if (
					await deps.removeDirectory(
						{ home: ctx.home, runId: run.id, directory: session.directory, openPaths: heldPaths },
						() => deps.removeObserver(ctx, { sourceRunId: run.id }),
					)
				) {
					await ctx.newTx(async (tx) => {
						await tx.execute(sql`DELETE FROM sessions WHERE id = ${session.id}`);
						await tx.execute(
							sql`UPDATE agent_runs SET closed_at = COALESCE(closed_at, ${ctx.now()}) WHERE id = ${run.id}`,
						);
					});
					result.deleted++;
					deleted = true;
				} else result.skipped++;
			}
			if (
				!deleted &&
				session.projectId === null &&
				session.archivedAt === null &&
				expired(current.archiveAfterDays, age)
			) {
				await ctx.newTx(async (tx) => {
					await tx.execute(sql`UPDATE sessions SET archived_at = ${ctx.now()} WHERE id = ${session.id}`);
				});
				result.archived++;
			} else if (!deleted) continue;
			ctx.emit({ type: "sessions.changed", id: session.id });
			ctx.emit({ type: "agent-runs.changed", id: run.id });
		} catch (error) {
			result.skipped++;
			ctx.log("Session cleanup failed", {
				session: candidate.id,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			release();
		}
	}
	return result;
}
