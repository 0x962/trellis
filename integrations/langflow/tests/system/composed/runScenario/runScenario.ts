import assert from "node:assert/strict";
import {
	FlowDocumentV1Schema,
	FlowExecutionViewV1Schema,
	FlowRecoveryV1Schema,
} from "@trellis/api";
import type { loadQualifiedPackage } from "../../../../release";
import type { BatchInput, Scenario } from "../batchInput";
import type { httpClient } from "../httpClient";
import { sameVisit } from "../sameVisit";
import { verifyView } from "../verifyView";

export async function runScenario(
	input: BatchInput,
	scenario: Scenario,
	qualified: Awaited<ReturnType<typeof loadQualifiedPackage>>,
	request: ReturnType<typeof httpClient>,
) {
	const recovery = FlowRecoveryV1Schema.parse(
		await request("GET", "/flow-executions/recovery-v1"),
	);
	assert.equal(recovery.state, "open", "host_recovery_not_open");
	const document = FlowDocumentV1Schema.parse(
		await request("GET", `/flows/${encodeURIComponent(scenario.start.flow)}/document-v1`),
	);
	assert.equal(document.engine, "langflow");
	assert.equal(document.documentHash, scenario.documentHash);
	assert.equal(document.revision, scenario.start.expectedVersion);
	assert.ok(document.publication.state === "published");
	const publication = document.publication.publication;
	assert.equal(publication.enginePackageDigest, qualified.candidate.enginePackageDigest);
	assert.equal(publication.componentManifestHash, qualified.candidate.componentManifestHash);
	let view = FlowExecutionViewV1Schema.parse(
		await request("POST", "/flow-executions/start-v1", scenario.start),
	);
	const executionId = view.id;
	const sent = new Map<number, { key: string; occurrenceKey: string }>();
	let canceled = false;
	let previousRevision = view.revision;
	let previousEvent = view.lastEventSeq;
	for (;;) {
		assert.equal(view.id, executionId);
		assert.equal(view.engine, "langflow");
		assert.equal(view.flowId, document.flow.id);
		assert.equal(view.ticketId, scenario.ticketId);
		assert.equal(view.projectId, scenario.projectId);
		assert.equal(view.snapshot.documentHash, scenario.documentHash);
		assert.deepEqual(view.publication, publication);
		assert.equal(view.submission?.requestId, scenario.start.requestId);
		assert.equal(view.diffId ?? null, scenario.start.diffId ?? null);
		assert.equal(view.reviewedHead, scenario.start.headSha ?? null);
		assert.ok(view.revision >= previousRevision);
		assert.ok(view.lastEventSeq >= previousEvent);
		previousRevision = view.revision;
		previousEvent = view.lastEventSeq;
		if (
			scenario.cancelAt !== null && !canceled &&
			view.occurrences.some((row) =>
				sameVisit(row, scenario.cancelAt!) &&
				["running", "waiting_human"].includes(row.state),
			)
		) {
			view = FlowExecutionViewV1Schema.parse(await request(
				"POST", `/flow-executions/${executionId}/cancel-v1`,
				{ id: executionId, expectedRevision: view.revision },
			));
			canceled = true;
			continue;
		}
		const next = scenario.decisions.findIndex((decision, index) =>
			!sent.has(index) && view.occurrences.some((row) =>
				sameVisit(row, decision.visit) && row.state === "waiting_human" && row.waitReason === "human",
			),
		);
		if (next !== -1 && !canceled) {
			const decision = scenario.decisions[next]!;
			const matches = view.occurrences.filter((item) => sameVisit(item, decision.visit));
			assert.equal(matches.length, 1, "human_wait_not_unique");
			const row = matches[0]!;
			sent.set(next, { key: row.actionKey, occurrenceKey: row.occurrenceKey });
			view = FlowExecutionViewV1Schema.parse(await request(
				"POST", `/flow-executions/${executionId}/decision-v1`,
				{
					id: executionId, key: row.actionKey, expectedRevision: view.revision,
					approved: decision.approved, output: decision.output,
				},
			));
			continue;
		}
		if (
			["succeeded", "failed", "canceled"].includes(view.status) &&
			view.stopObligations.every((stop) => stop.state === "confirmed")
		) break;
		const remaining = Date.parse(input.deadlineAt) - Date.now();
		assert.ok(remaining > 0, "batch_deadline_elapsed");
		await Bun.sleep(Math.min(input.pollIntervalMs, remaining, 2_147_483_647));
		view = FlowExecutionViewV1Schema.parse(
			await request("GET", `/flow-executions/${executionId}/view-v1`),
		);
	}
	assert.equal(canceled, scenario.cancelAt !== null);
	assert.equal(sent.size, scenario.decisions.length, "expected_decision_not_observed");
	assert.equal(view.decisionDeliveries.length, sent.size);
	for (const [index, identity] of sent) {
		const expected = scenario.decisions[index]!;
		const matches = view.decisionDeliveries.filter((delivery) =>
			delivery.actionKey === identity.key && delivery.occurrenceKey === identity.occurrenceKey,
		);
		assert.equal(matches.length, 1, "decision_receipt_not_unique");
		assert.equal(matches[0]!.approved, expected.approved);
		assert.equal(matches[0]!.output, expected.output);
		assert.equal(matches[0]!.state, "confirmed");
	}
	await verifyView(view, scenario, request);
	const replay = FlowExecutionViewV1Schema.parse(
		await request("POST", "/flow-executions/start-v1", scenario.start),
	);
	assert.equal(replay.id, executionId, "terminal_start_replay_changed_execution");
	return { name: scenario.name, executionId, status: view.status, revision: view.revision };
}
