import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import { launchRun } from "../../../agentRuns/launchRun";
import { startNative } from "../../../agentRuns/nativeStart.ts";
import type { IoCtx } from "../../../support.ts";
import { reserveNext } from "../reserveNext";

export async function dispatch(ctx: IoCtx, _input: unknown, start = startNative) {
	const epics = await ctx.newTx((tx) =>
		rows<{ id: string }>(tx, sql`SELECT id FROM epics WHERE autopilot->>'enabled' = 'true' ORDER BY id`),
	);
	const results = await Promise.allSettled(
		epics.map(async (epic) => {
			while (true) {
				const events: TrellisEvent[] = [];
				const reservation = await ctx.newTx((tx) =>
					reserveNext({ ...ctx.core, emit: (event) => events.push(event) }, tx, { epicId: epic.id }),
				);
				for (const event of events) ctx.emit(event);
				if (reservation === null) return;
				if (!reservation.replay) {
					const { run, attempt, config, resume, previousAttemptId, previousAccountId } = reservation;
					ctx.emit({ type: "agent-runs.changed", id: run.id });
					launchRun(ctx, run.id, attempt.id, (background) =>
						start(background, {
							run,
							attempt,
							config,
							resume,
							previousAttemptId,
							previousAccountId,
							preserveAssignmentOnFailure: true,
						}),
					);
				}
			}
		}),
	);
	const failures = results.filter((result) => result.status === "rejected");
	if (failures.length > 0)
		throw new AggregateError(
			failures.map((result) => result.reason),
			failures
				.map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
				.join("; "),
		);
}
