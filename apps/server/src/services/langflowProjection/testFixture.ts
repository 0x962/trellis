import { readFileSync } from "node:fs";
import { executionViewV1Example, flowV1FixtureIds } from "@trellis/api";
import { NativeCompletionV1Schema, protocolDigest } from "../../langflowContracts";
import type { ProjectionFacts } from "./facts.ts";
import type { ProjectionObservation } from "./observation.ts";

export function fixture() {
	const raw = JSON.parse(
		readFileSync(new URL("../../langflowContracts/fixtures/native-completion.json", import.meta.url), "utf8"),
	);
	const binding = {
		executionId: flowV1FixtureIds.execution,
		publicationId: flowV1FixtureIds.publication,
		engineJobId: "00000000-0000-4000-8000-000000000001",
		engineEpoch: 1,
	};
	raw.provenance.request = {
		...raw.provenance.request,
		...binding,
		admissionReceipt: { ...raw.provenance.request.admissionReceipt, ...binding },
	};
	raw.provenance.agentRunId = flowV1FixtureIds.agentRun;
	raw.handle.agentRunId = flowV1FixtureIds.agentRun;
	raw.result.agentRunId = flowV1FixtureIds.agentRun;
	raw.result.launchBinding = binding;
	const completion = NativeCompletionV1Schema.parse(raw);
	const { request } = completion.provenance;
	const view = structuredClone(executionViewV1Example);
	view.submission!.engineJobId = binding.engineJobId;
	const observed: ProjectionObservation = {
		expectedRevision: view.revision,
		checkpoint: {
			version: 1,
			...binding,
			checkpointId: "checkpoint",
			revision: 1,
			continuationRef: "continuation",
			waits: [],
		},
		status: "succeeded",
		failure: null,
		occurrences: [
			{
				nodeId: request.nodeId,
				occurrenceKey: request.occurrenceKey,
				parentOccurrenceKey: request.parentOccurrenceKey,
				phase: request.phase,
				iterationPath: request.iterationPath,
				kind: "agent",
				reviewArea: null,
				acceptedResultId: completion.result.completionId,
				title: "Review",
				instruction: "Read the diff.",
				actionKey: "review",
				state: "succeeded",
				error: null,
				skipReason: null,
				startedAt: "2026-09-29T06:00:00Z",
				endedAt: "2026-09-29T06:05:00Z",
				deadlineRefs: [],
			},
		],
	};
	const resultDigest = protocolDigest(JSON.stringify(completion.result));
	const facts: ProjectionFacts = {
		classification: null,
		native: [
			{
				provenance: completion.provenance,
				handle: completion.handle,
				launchReceipt: null,
				completion: {
					completion,
					resultDigest,
					receipt: {
						version: 1,
						executionId: binding.executionId,
						engineJobId: binding.engineJobId,
						completionId: completion.result.completionId,
						resultDigest,
						engineWaitId: "wait",
						continuationReceiptId: "continuation-receipt",
						acceptedAt: "2026-09-29T06:05:00Z",
					},
				},
			},
		],
		human: [],
		stops: [],
		deadlines: [],
	};
	return { view, observed, facts, binding, now: new Date("2026-09-29T06:06:00Z") };
}
