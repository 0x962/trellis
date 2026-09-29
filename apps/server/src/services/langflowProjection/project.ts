import { isDeepStrictEqual } from "node:util";
import { type FlowExecutionViewV1, FlowExecutionViewV1Schema, type FlowOccurrenceV1 } from "@trellis/api";
import type { EngineJobBindingV1, OccurrenceV1 } from "../../langflowContracts";
import type { ProjectionFacts } from "./facts.ts";
import { type ProjectionObservation, ProjectionObservationSchema } from "./observation.ts";
import { projectOccurrence } from "./occurrence.ts";
import { publicDecision, publicStop } from "./publicDetails.ts";
import { reviewWaits } from "./reviewWaits";

const identity = (row: OccurrenceV1) => ({
	nodeId: row.nodeId,
	occurrenceKey: row.occurrenceKey,
	parentOccurrenceKey: row.parentOccurrenceKey,
	phase: row.phase,
	iterationPath: row.iterationPath,
});
const terminal = (row: FlowOccurrenceV1) => ["succeeded", "skipped", "failed", "canceled"].includes(row.state);

export function project(
	current: FlowExecutionViewV1,
	input: ProjectionObservation,
	facts: ProjectionFacts,
	binding: EngineJobBindingV1,
	seq: number,
	now: Date,
): FlowExecutionViewV1 {
	const observation = ProjectionObservationSchema.parse(input);
	if (observation.expectedRevision !== current.revision) throw new Error("projection_conflict");
	for (const field of ["executionId", "publicationId", "engineJobId", "engineEpoch"] as const) {
		if (observation.checkpoint[field] !== binding[field]) throw new Error("stale_owner");
	}
	if (
		current.id !== binding.executionId ||
		current.publication?.publicationId !== binding.publicationId ||
		current.submission?.engineJobId !== binding.engineJobId
	)
		throw new Error("identity_conflict");
	if (
		facts.classification &&
		(facts.classification.binding.executionId !== current.id ||
			facts.classification.binding.publicationId !== binding.publicationId ||
			facts.classification.binding.diffId !== current.diffId ||
			facts.classification.binding.reviewedHead !== current.reviewedHead)
	) {
		throw new Error("receipt_mismatch");
	}
	const pendingReviews = reviewWaits(observation, facts, current);
	const seen = new Set<string>();
	const previous = new Map(current.occurrences.map((row) => [row.occurrenceKey, row]));
	const projectedOccurrences = observation.occurrences.map((observed) => {
		const semantic = JSON.stringify({ ...identity(observed), occurrenceKey: undefined });
		if (seen.has(semantic)) throw new Error("identity_conflict");
		seen.add(semantic);
		const prior = previous.get(observed.occurrenceKey);
		if (
			prior &&
			(!isDeepStrictEqual(identity(prior), identity(observed)) ||
				prior.kind !== observed.kind ||
				prior.title !== observed.title ||
				prior.instruction !== observed.instruction ||
				prior.actionKey !== observed.actionKey)
		) {
			throw new Error("identity_conflict");
		}
		const projected = projectOccurrence(observed, prior, facts, pendingReviews.get(observed.occurrenceKey));
		if (prior && terminal(prior)) {
			if (
				prior.state !== projected.state ||
				(prior.output !== null && prior.output !== projected.output) ||
				prior.decision !== projected.decision
			) {
				throw new Error("stale_snapshot");
			}
		}
		return projected;
	});
	const byKey = new Map(projectedOccurrences.map((row) => [row.occurrenceKey, row]));
	for (const prior of current.occurrences) {
		if (!byKey.has(prior.occurrenceKey)) throw new Error("incomplete_snapshot");
	}
	const occurrences = [
		...current.occurrences.map((row) => byKey.get(row.occurrenceKey)!),
		...projectedOccurrences.filter((row) => !previous.has(row.occurrenceKey)),
	];
	for (const fact of facts.native) {
		const request = fact.provenance.request;
		const occurrence = byKey.get(request.occurrenceKey);
		if (
			!occurrence ||
			!isDeepStrictEqual(identity(request), identity(occurrence)) ||
			request.executionId !== binding.executionId ||
			request.publicationId !== binding.publicationId ||
			request.engineJobId !== binding.engineJobId ||
			request.engineEpoch > binding.engineEpoch
		) {
			throw new Error("receipt_mismatch");
		}
	}
	for (const delivery of facts.human) {
		const wait = delivery.decision.wait;
		const occurrence = byKey.get(wait.occurrence.occurrenceKey);
		if (
			!occurrence ||
			!isDeepStrictEqual(identity(wait.occurrence), identity(occurrence)) ||
			wait.actionKey !== occurrence.actionKey ||
			wait.executionId !== binding.executionId ||
			wait.publicationId !== binding.publicationId ||
			wait.engineJobId !== binding.engineJobId ||
			wait.engineEpoch > binding.engineEpoch
		)
			throw new Error("receipt_mismatch");
	}
	const unknown =
		occurrences.some((row) => row.state === "unknown") ||
		facts.stops.some((stop) => stop.state === "ownership_unknown");
	const human = occurrences.some((row) => row.waitReason === "human");
	const review = occurrences.some((row) => row.waitReason === "review");
	const native = occurrences.some((row) => row.waitReason === "native");
	const complete =
		occurrences.every((row) => row.state === "succeeded" || row.state === "skipped") &&
		facts.stops.every((stop) => stop.state === "confirmed") &&
		observation.checkpoint.waits.length === 0;
	let status: FlowExecutionViewV1["status"] = "running";
	let detail: FlowExecutionViewV1["detail"] = observation.status === "queued" ? "queued" : "active";
	if (observation.status === "failed" || observation.status === "canceled") {
		status = observation.status;
		detail = observation.status;
	} else if (unknown || (observation.status === "succeeded" && !complete)) {
		status = "waiting";
		detail = "unknown";
	} else if (human) {
		status = "waiting";
		detail = "waiting_human";
	} else if (native) {
		status = "waiting";
		detail = "waiting_native";
	} else if (review) {
		status = "waiting";
		detail = "waiting_review";
	} else if (observation.status === "succeeded") {
		status = "succeeded";
		detail = "completed";
	}
	if (["succeeded", "failed", "canceled"].includes(current.status) && current.status !== status) {
		throw new Error("stale_snapshot");
	}
	return FlowExecutionViewV1Schema.parse({
		...current,
		revision: current.revision + 1,
		updatedAt: now.toISOString(),
		lastEventSeq: seq,
		status,
		detail,
		failureKind: observation.failure?.kind ?? null,
		error: observation.failure?.reason ?? null,
		submission: { ...current.submission, engineEpoch: binding.engineEpoch },
		occurrences,
		decisionDeliveries: facts.human.map(publicDecision),
		stopObligations: facts.stops.map(publicStop),
		deadlines: facts.deadlines.map(({ deadlineId, groupOccurrenceKey, launchedAt, deadlineAt }) => ({
			deadlineId,
			groupOccurrenceKey,
			launchedAt,
			deadlineAt,
		})),
	});
}
