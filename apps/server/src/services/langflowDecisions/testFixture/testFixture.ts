import { executionViewV1Example, type FlowExecutionViewV1, occurrenceV1Example } from "@trellis/api";
import type { RequestContext } from "../../../context.ts";
import {
	type DecisionLookupRequestV1,
	DeliveryAuthorityV1Schema,
	EngineCheckpointV1Schema,
	HumanWaitV1Schema,
} from "../../../langflowContracts";
import authorityFixture from "../../../langflowContracts/fixtures/authority.json";
import waitFixture from "../../../langflowContracts/fixtures/human-wait.json";

export function testFixture() {
	const wait = HumanWaitV1Schema.parse({
		...waitFixture,
		executionId: executionViewV1Example.id,
		publicationId: executionViewV1Example.publication!.publicationId,
	});
	const ctx: RequestContext = {
		actor: { kind: "human", name: "reviewer" },
		session: null,
		reqId: "request-1",
		now: new Date("2026-09-29T06:30:00.000Z"),
	};
	const checkpoint = EngineCheckpointV1Schema.parse({
		version: 1,
		executionId: wait.executionId,
		publicationId: wait.publicationId,
		engineJobId: wait.engineJobId,
		engineEpoch: 2,
		checkpointId: "checkpoint-1",
		revision: 1,
		continuationRef: "continuation-1",
		waits: [{ kind: "human", waitId: "wait-1", request: wait }],
	});
	const view: FlowExecutionViewV1 = {
		...structuredClone(executionViewV1Example),
		submission: { ...executionViewV1Example.submission!, engineJobId: wait.engineJobId, engineEpoch: 2 },
		occurrences: [
			{
				...occurrenceV1Example,
				...wait.occurrence,
				actionKey: wait.actionKey,
				state: "waiting_human" as const,
				waitReason: "human" as const,
				attempts: [],
			},
		],
	};
	const input = {
		id: view.id,
		key: wait.actionKey,
		expectedRevision: view.revision,
		approved: false,
		output: "Please fix the result.",
	};
	const authority = DeliveryAuthorityV1Schema.parse({
		...authorityFixture,
		executionId: wait.executionId,
		publicationId: wait.publicationId,
	});
	return { ctx, checkpoint, view, input, authority, wait };
}

export function accepted(lookup: DecisionLookupRequestV1) {
	return {
		...lookup,
		acceptanceId: "acceptance-1",
		signalId: "signal-1",
		enqueueObligationId: "enqueue-1",
		acceptedAt: "2026-09-29T06:30:00.000Z",
	};
}
