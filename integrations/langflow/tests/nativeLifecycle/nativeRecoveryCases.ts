import { describe, expect, test } from "bun:test";
import { GroupDeadlineV1Schema, NativeHandleV1Schema } from "../../../../apps/server/src/langflowContracts/index.ts";
import { nestedFlow } from "../../fixtures/nativeHost";
import { closeFixture, processEvidence, row, useFixture } from "./testEvidence.ts";

describe.serial("native recovery feasibility", () => {
	test("F4 retains the reserved attempt before launch and after a lost launch response", async () => {
		let fixture = await useFixture();
		fixture.abortNextReservation();
		await expect(fixture.claim()).rejects.toThrow("fixture_reservation_kill");
		expect((await fixture.tasks()).rows).toHaveLength(0);
		expect((await fixture.bindings()).rows).toHaveLength(0);
		const reserved = (await fixture.claim())!;
		const bridge = reserved.bridge;
		expect(bridge).toMatchObject({
			executionId: fixture.execution.id,
			taskKey: reserved.key,
			agentRunId: reserved.run.id,
			attemptId: reserved.attempt.id,
		});
		expect(bridge.taskKey).toContain("/");
		expect(bridge.taskKey).toContain(":step:1");
		expect((await fixture.replayBinding(reserved.key)).stepId).toBe(bridge.stepId);
		const changedRequest = JSON.stringify({ ...bridge.request, specHash: "4".repeat(64) });
		await expect(fixture.replayBinding(reserved.key, changedRequest)).rejects.toThrow("bridge_reservation_conflict");
		await fixture.reconcile();
		let tasks = await fixture.tasks();
		expect(tasks.rows).toHaveLength(1);
		expect(row(tasks.rows).attempt_id).toBe(reserved.attempt.id);
		expect(fixture.processes.launches).toEqual([]);
		expect((await fixture.read()).state.steps[0]!.state).toBe("unknown");
		const run = await fixture.run(reserved.run.id);
		expect(
			NativeHandleV1Schema.parse({
				version: 1,
				stepId: bridge.stepId,
				agentRunId: reserved.run.id,
				attemptId: reserved.attempt.id,
				workspaceId: run.workspaceId,
				providerSessionId: run.sessionId,
				state: "unknown",
				revision: 1,
			}),
		).toMatchObject({ attemptId: reserved.attempt.id, state: "unknown" });

		await closeFixture();
		fixture = await useFixture();
		fixture.processes.loseNextLaunchResponse();
		const lostClaim = (await fixture.claim())!;
		await expect(fixture.launch(lostClaim)).rejects.toThrow("The process launched, but its response was lost.");
		tasks = await fixture.tasks();
		const attemptId = row(tasks.rows).attempt_id;
		expect(fixture.processes.launches).toEqual([attemptId]);
		const launchedPid = (await fixture.processes.inspect(attemptId)).pid;
		expect(typeof launchedPid).toBe("number");

		fixture.restartProcessHost();
		await fixture.reconcile();
		expect(await fixture.binding(lostClaim.key)).toMatchObject({
			stepId: lostClaim.bridge.stepId,
			taskKey: lostClaim.key,
			agentRunId: lostClaim.run.id,
			attemptId: lostClaim.attempt.id,
			requestBytes: lostClaim.bridge.requestBytes,
		});
		expect((await fixture.processes.inspect(attemptId)).pid).toBe(launchedPid);
		expect(fixture.processes.launches).toEqual([]);
		await fixture.processes.acknowledge(attemptId);
		fixture.restartProcessHost();
		await fixture.reconcile();
		await fixture.processes.complete(attemptId, "result-native-lifecycle", "Done");
		fixture.restartProcessHost();
		await fixture.reconcile();
		await fixture.reconcile();
		tasks = await fixture.tasks();
		expect(tasks.rows).toHaveLength(1);
		expect(row(tasks.rows)).toMatchObject({ attempt_id: attemptId, result_id: "result-native-lifecycle" });
		expect((await fixture.read()).state.status).toBe("succeeded");
		processEvidence.push({
			probe: "F4",
			attemptId,
			pid: launchedPid,
			result: "persisted",
			reservationRollback: "transaction_fault",
			reopenBoundary: "same_process_adapter_reopen",
			authorityProcessCrash: false,
		});
	});

	test("F6 starts nested clocks at launchedAt and sends the half and quarter warnings once", async () => {
		const fixture = await useFixture(nestedFlow());
		const first = (await fixture.claim())!;
		const launchTime = Date.now();
		const atMinute = (minute: number) => new Date(launchTime + minute * 60 * 1000).toISOString();
		let state = (await fixture.read()).state;
		expect(
			state.steps.filter((step) => ["outer", "inner"].includes(step.nodeId)).map((step) => step.deadlineAt),
		).toEqual([null, null]);

		fixture.setNow(atMinute(0));
		const launched = await fixture.launch(first);
		await fixture.recordLaunch(first, launched.launchedAt);
		await fixture.processes.acknowledge(first.attempt.id);
		state = (await fixture.read()).state;
		const original = Object.fromEntries(
			state.steps
				.filter((step) => ["outer", "inner"].includes(step.nodeId))
				.map((step) => [step.nodeId, step.deadlineAt]),
		);
		expect(original).toEqual({
			outer: Date.parse(atMinute(2880)),
			inner: Date.parse(atMinute(20)),
		});
		expect(
			GroupDeadlineV1Schema.parse({
				deadlineId: "deadline-outer",
				groupOccurrenceKey: "outer:1",
				budgetMs: 2880 * 60 * 1000,
				launchedAt: launched.launchedAt,
				deadlineAt: atMinute(2880),
				launchReceiptId: "launch-receipt-outer",
			}),
		).toMatchObject({ budgetMs: 172_800_000 });

		fixture.setNow(atMinute(10));
		await fixture.reconcile();
		fixture.setNow(atMinute(15));
		await fixture.reconcile();
		await fixture.reconcile();
		expect(fixture.warnings.map((warning) => warning.text)).toEqual([
			expect.stringContaining("about 10 min left"),
			expect.stringContaining("about 5 min left"),
		]);

		await fixture.processes.complete(first.attempt.id, "result-first", "First done");
		fixture.setNow(atMinute(16));
		await fixture.observeClaim(first);
		const second = (await fixture.claim())!;
		await fixture.launch(second);
		state = (await fixture.read()).state;
		expect(fixture.processes.launches).toHaveLength(2);
		expect(
			Object.fromEntries(
				state.steps
					.filter((step) => ["outer", "inner"].includes(step.nodeId))
					.map((step) => [step.nodeId, step.deadlineAt]),
			),
		).toEqual(original);
	});
});
