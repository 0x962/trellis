import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { FlowStep } from "../../../../apps/server/src/agents/nativeFlow/types.ts";
import { StopObligationV1Schema } from "../../../../apps/server/src/langflowContracts/index.ts";
import {
	DurableAuthorityFixture,
	deliveryAuthority,
	humanFlow,
	ids,
	launchProvenance,
} from "../../fixtures/nativeHost";
import { processEvidence, row, useFixture } from "./testEvidence.ts";

describe.serial("native cancellation and authority feasibility", () => {
	test("F7 keeps a failed exact-attempt stop and isolates a late completion", async () => {
		const fixture = await useFixture();
		fixture.processes.loseNextLaunchResponse();
		const claim = (await fixture.claim())!;
		await expect(fixture.launch(claim)).rejects.toThrow("The process launched, but its response was lost.");
		await fixture.reconcile();
		const task = row((await fixture.tasks()).rows);
		const bridge = (await fixture.binding(task.key))!;
		await fixture.processes.complete(task.attempt_id, "late-result", "Late completion");
		await fixture.cancel();

		fixture.processes.failStops("The native host lost ownership during stop.");
		expect(await fixture.drainStops()).toEqual(["The native host lost ownership during stop."]);
		let step = (await fixture.read()).state.steps[0]!;
		expect(step).toMatchObject({ state: "canceled", needsStop: true });
		expect(step.error).toBe("The native host lost ownership during stop.");
		expect(await fixture.processes.inspect(task.attempt_id)).toMatchObject({ status: "running" });
		expect(
			StopObligationV1Schema.parse({
				version: 1,
				obligationId: "stop-native-lifecycle",
				executionId: fixture.execution.id,
				stepId: bridge.stepId,
				agentRunId: task.run_id,
				attemptId: task.attempt_id,
				reason: "canceled",
				requestedAt: fixture.clock.at.toISOString(),
				revision: 1,
				state: "ownership_unknown",
				exitReceipt: null,
			}),
		).toMatchObject({ attemptId: task.attempt_id, state: "ownership_unknown" });

		fixture.processes.failStops(null);
		expect(await fixture.drainStops()).toEqual([]);
		step = (await fixture.read()).state.steps[0]!;
		expect(step).toMatchObject({ state: "canceled", needsStop: false, error: null });
		expect(fixture.processes.stops).toEqual([task.attempt_id, task.attempt_id]);
		const exitedPid = (await fixture.processes.inspect(task.attempt_id)).pid;
		const exitedCode = (await fixture.processes.inspect(task.attempt_id)).exitCode;
		fixture.restartProcessHost();
		expect(await fixture.processes.inspect(task.attempt_id)).toMatchObject({ pid: exitedPid, status: "exited" });
		processEvidence.push({
			probe: "F7",
			attemptId: task.attempt_id,
			pid: exitedPid,
			exitCode: exitedCode,
			childExitObserved: true,
		});
		expect(
			StopObligationV1Schema.parse({
				version: 1,
				obligationId: "stop-native-lifecycle",
				executionId: fixture.execution.id,
				stepId: bridge.stepId,
				agentRunId: task.run_id,
				attemptId: task.attempt_id,
				reason: "canceled",
				requestedAt: fixture.clock.at.toISOString(),
				revision: 2,
				state: "confirmed",
				exitReceipt: {
					attemptId: task.attempt_id,
					receiptId: "exit-native-lifecycle",
					exitedAt: fixture.clock.at.toISOString(),
					confirmedAt: fixture.clock.at.toISOString(),
				},
			}),
		).toMatchObject({ attemptId: task.attempt_id, state: "confirmed" });

		await fixture.reconcile();
		expect(row((await fixture.tasks()).rows)).toMatchObject({ attempt_id: task.attempt_id, result_id: null });
		expect((await fixture.read()).state.status).toBe("canceled");
	});

	test("F21 prototype persists CAS takeover, revocation, and the original completion", async () => {
		const fixture = await useFixture();
		const claim = (await fixture.claim())!;
		await fixture.launch(claim);
		await fixture.reconcile();
		const task = row((await fixture.tasks()).rows);
		const bridge = (await fixture.binding(task.key))!;
		const provenance = launchProvenance(
			task.attempt_id,
			task.run_id,
			fixture.execution.id,
			bridge.stepId,
			bridge.request,
		);
		const provenanceBytes = JSON.stringify(provenance);
		const directory = join(fixture.ctx.home, "authority");
		let authority = await DurableAuthorityFixture.create(
			directory,
			deliveryAuthority(fixture.execution.id),
			provenance,
		);
		const observationId = "observation-owner-one";
		const revocationId = "revocation-owner-one";
		const processPid = (await fixture.processes.inspect(task.attempt_id)).pid;
		fixture.restartProcessHost();
		const processObservation = await fixture.processes.inspect(task.attempt_id);
		expect(processObservation).toMatchObject({ pid: processPid, status: "running" });
		await authority.observe({
			id: observationId,
			executionId: fixture.execution.id,
			ownerId: "owner-one",
			engineEpoch: 1,
			ownershipRevision: 1,
			agentRunId: task.run_id,
			attemptId: task.attempt_id,
			process: processObservation,
			observedAt: "2026-09-29T10:11:00.000Z",
		});
		await authority.revoke({
			id: revocationId,
			executionId: fixture.execution.id,
			ownerId: "owner-one",
			capabilityId: "capability-one",
			observationId,
			revokedAt: "2026-09-29T10:11:30.000Z",
		});
		authority = DurableAuthorityFixture.open(directory);
		expect(await authority.trace()).toMatchObject({
			sequence: 3,
			observations: [{ id: observationId, attemptId: task.attempt_id }],
			revocations: [{ id: revocationId, observationId }],
		});
		await expect(
			authority.authorize("owner-one", "capability-one", "completion.deliver", "2026-09-29T10:11:45.000Z"),
		).rejects.toThrow("stale_owner");
		const takeovers = await Promise.allSettled([
			authority.takeover({
				requestId: ids.takeoverOne,
				expectedOwnerId: "owner-one",
				expectedEpoch: 1,
				expectedRevision: 1,
				newOwnerId: "owner-two",
				capabilityId: "capability-two",
				observationId,
				revocationId,
				transferId: "transfer-owner-two",
				committedAt: "2026-09-29T10:12:00.000Z",
				expiresAt: "2026-09-29T10:20:00.000Z",
			}),
			authority.takeover({
				requestId: ids.takeoverTwo,
				expectedOwnerId: "owner-one",
				expectedEpoch: 1,
				expectedRevision: 1,
				newOwnerId: "owner-three",
				capabilityId: "capability-three",
				observationId,
				revocationId,
				transferId: "transfer-owner-three",
				committedAt: "2026-09-29T10:12:00.000Z",
				expiresAt: "2026-09-29T10:20:00.000Z",
			}),
		]);
		expect(takeovers.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
		const takeover = takeovers.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))[0]!;
		const owner = takeover.authority.ownerId;
		const capability = takeover.authority.capabilityId;
		expect(takeover.authority.engineEpoch).toBe(2);
		expect(JSON.stringify(await authority.provenance())).toBe(provenanceBytes);

		await fixture.processes.complete(task.attempt_id, "result-after-takeover", "Done after takeover");
		await expect(
			authority.authorize(owner, capability, "completion.deliver", "2026-09-29T10:20:00.000Z"),
		).rejects.toThrow("authority_expired");
		const renewalObservationId = "observation-current-owner";
		await authority.observe({
			id: renewalObservationId,
			executionId: fixture.execution.id,
			ownerId: owner,
			engineEpoch: 2,
			ownershipRevision: 2,
			agentRunId: task.run_id,
			attemptId: task.attempt_id,
			process: await fixture.processes.inspect(task.attempt_id),
			observedAt: "2026-09-29T10:20:30.000Z",
		});
		const renewal = await authority.renew({
			requestId: ids.renewal,
			expectedRevision: 2,
			observationId: renewalObservationId,
			renewalId: "renewal-current-owner",
			capabilityId: "capability-renewed",
			issuedAt: "2026-09-29T10:21:00.000Z",
			expiresAt: "2026-09-29T10:30:00.000Z",
		});
		authority = DurableAuthorityFixture.open(directory);
		await authority.authorize(owner, "capability-renewed", "completion.deliver", "2026-09-29T10:22:00.000Z");
		expect(renewal.authority.engineEpoch).toBe(2);
		expect(JSON.stringify(await authority.provenance())).toBe(provenanceBytes);
		expect(await authority.trace()).toMatchObject({
			sequence: 6,
			takeovers: [{ transferId: takeover.transferId }],
			renewals: [{ renewalId: "renewal-current-owner" }],
		});
		await fixture.reconcile();
		expect(row((await fixture.tasks()).rows)).toMatchObject({
			attempt_id: task.attempt_id,
			result_id: "result-after-takeover",
		});
		expect((await fixture.processes.inspect(task.attempt_id)).pid).toBe(processPid);
		expect(fixture.processes.launches).toEqual([]);
		expect(await fixture.binding(task.key)).toMatchObject({
			stepId: bridge.stepId,
			taskKey: task.key,
			agentRunId: task.run_id,
			attemptId: task.attempt_id,
			requestBytes: bridge.requestBytes,
		});
		processEvidence.push({
			probe: "F21",
			attemptId: task.attempt_id,
			pid: processPid,
			owner,
			sequence: (await authority.trace()).sequence,
			reopenBoundary: "same_process_file_store_reopen",
			authorityProcessCrash: false,
		});
	});

	test("F21 capability expiry does not answer a human wait", async () => {
		const fixture = await useFixture(humanFlow());
		const before = await fixture.read();
		const step = before.state.steps[0] as FlowStep;
		expect(step.state).toBe("waiting_human");
		const authority = await DurableAuthorityFixture.create(
			join(fixture.ctx.home, "human-authority"),
			deliveryAuthority(fixture.execution.id),
			launchProvenance(crypto.randomUUID(), "run-human-wait", fixture.execution.id),
		);
		await expect(
			authority.authorize("owner-one", "capability-one", "decision.deliver", "2026-09-29T10:10:00.000Z"),
		).rejects.toThrow("authority_expired");
		expect((await fixture.read()).state.steps[0]!.state).toBe("waiting_human");
		await fixture.decide(`${step.key}:${step.phase}:${step.round}`, true);
		expect((await fixture.read()).state.status).toBe("succeeded");
	});
});
