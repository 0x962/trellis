import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { recordDeadline, recordLaunch, reserveNative } from "../../../db/queries/langflowExecution";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import type { Tx } from "../../../db/tx.ts";
import type { GroupDeadlineV1 } from "../../../langflowContracts";
import { recordLaunchClocks } from "../../langflowClocks/recordLaunchClocks";

export async function stopFixture(launched = false) {
	const fixture = await receiptFixture();
	const core: ServiceCtx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		reqId: "fixture",
		now,
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const run = <T>(fn: (tx: Tx) => Promise<T>) => fixture.db.transaction(fn);
	const deadline: GroupDeadlineV1 = {
		deadlineId: "deadline-1",
		groupOccurrenceKey: "outer.501",
		budgetMs: 120_000,
		launchedAt: null,
		deadlineAt: null,
		launchReceiptId: null,
	};
	const request = { ...nativeRequest, groupDeadlineRefs: [deadline.deadlineId] };
	const reservation = await run(async (tx) => {
		await recordDeadline(tx, { executionId: ids.execution, deadline });
		return reserveNative(tx, {
			requestBytes: JSON.stringify(request),
			taskKey: "outer/501/step",
			handle,
			authority: fixture.authority,
			now,
		});
	});
	if (launched)
		await run(async (tx) => {
			await recordLaunch(tx, {
				executionId: ids.execution,
				receipt: {
					version: 1,
					launchReceiptId: "launch-1",
					stepId: handle.stepId,
					attemptId: handle.attemptId,
					launchedAt: now.toISOString(),
					recordedAt: new Date(now.getTime() + 30_000).toISOString(),
					groupDeadlines: [],
				},
			});
			await recordLaunchClocks(core, tx, { executionId: ids.execution, stepId: handle.stepId });
		});
	const io = { home: "unused", newTx: run, now: () => now, emit: core.emit, log: () => {} };
	return { ...fixture, core, run, io, request, reservation, deadline };
}
