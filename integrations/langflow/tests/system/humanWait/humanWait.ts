import { DeliveryAuthorityV1Schema, HumanWaitV1Schema } from "../../../../../apps/server/src/langflowContracts";
import authoritySample from "../../../../../apps/server/src/langflowContracts/fixtures/authority.json";
import waitSample from "../../../../../apps/server/src/langflowContracts/fixtures/human-wait.json";
import { type ProjectionObservation, update } from "../../../../../apps/server/src/services/langflowProjection";
import { databaseStore } from "../../../../../apps/server/src/services/langflowStart";
import type { fixture } from "../fixture";

export async function humanWait(h: Awaited<ReturnType<typeof fixture>>) {
	await h.save();
	await h.publish();
	const reservation = await h.start();
	if (reservation.execution.engine !== "langflow") throw new Error("fixture_engine");
	const execution = reservation.execution;
	const authority = DeliveryAuthorityV1Schema.parse({
		...authoritySample,
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		engineJobId: waitSample.engineJobId,
		engineEpoch: 1,
		permissions: ["native.reserve", "decision.deliver", "events.append"],
		hostId: execution.hostId,
		projectId: execution.projectId,
		publicationDigest: execution.publication.documentHash,
		issuedAt: "2026-09-29T06:00:00.000Z",
		expiresAt: "2026-09-29T07:00:00.000Z",
	});
	const store = databaseStore(h.system);
	await h.run((_ctx, tx) =>
		store.bind(tx, {
			executionId: execution.executionId,
			authority,
			correlation: {
				version: 1,
				hostId: execution.hostId,
				executionId: execution.executionId,
				publicationId: execution.publicationId,
				submissionDigest: execution.submission.submissionDigest,
				engineJobId: authority.engineJobId,
				engineSessionId: "fixture-engine-session",
				recordedAt: h.ctx.now.toISOString(),
			},
		}),
	);
	await h.run((_ctx, tx) => store.openAdmission(tx, { executionId: execution.executionId, now: h.ctx.now }));
	const wait = HumanWaitV1Schema.parse({
		...waitSample,
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		engineEpoch: authority.engineEpoch,
		deadlineRefs: [],
	});
	const initial = await h.view(execution.executionId);
	const observation: ProjectionObservation = {
		expectedRevision: initial.revision,
		checkpoint: {
			version: 1,
			executionId: execution.executionId,
			publicationId: execution.publicationId,
			engineJobId: authority.engineJobId,
			engineEpoch: authority.engineEpoch,
			checkpointId: "fixture-checkpoint",
			revision: 1,
			continuationRef: "fixture-continuation",
			waits: [{ kind: "human", waitId: "fixture-wait", request: wait }],
		},
		status: "running",
		failure: null,
		occurrences: [
			{
				...wait.occurrence,
				kind: "human",
				reviewArea: null,
				acceptedResultId: null,
				title: "Human decision",
				instruction: "Read the result.",
				actionKey: wait.actionKey,
				state: "waiting_human",
				error: null,
				skipReason: null,
				startedAt: h.ctx.now.toISOString(),
				endedAt: null,
				deadlineRefs: [],
			},
		],
	};
	const projected = await h.run(
		(ctx, tx) =>
			update(ctx, tx, {
				executionId: execution.executionId,
				authority,
				observation,
				sourceBytes: null,
			}),
		h.system,
	);
	return {
		execution,
		authority,
		observation,
		view: projected.view,
		input: {
			id: execution.executionId,
			key: wait.actionKey,
			expectedRevision: projected.view.revision,
			approved: false,
			output: "Please correct the result.",
		},
	};
}
