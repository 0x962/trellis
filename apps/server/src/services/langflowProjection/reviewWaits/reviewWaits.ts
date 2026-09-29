import { isDeepStrictEqual } from "node:util";
import type { FlowExecutionViewV1 } from "@trellis/api";
import { protocolDigest, type ReviewWaitV1 } from "../../../langflowContracts";
import type { ProjectionFacts } from "../facts.ts";
import type { ProjectionObservation } from "../observation.ts";

export function reviewWaits(
	observation: ProjectionObservation,
	facts: ProjectionFacts,
	current: FlowExecutionViewV1,
): Map<string, ReviewWaitV1> {
	const occurrences = new Map(observation.occurrences.map((row) => [row.occurrenceKey, row]));
	const result = new Map<string, ReviewWaitV1>();
	for (const wait of observation.checkpoint.waits) {
		if (wait.kind !== "review") continue;
		const request = wait.request;
		const observed = occurrences.get(request.occurrence.occurrenceKey);
		if (!observed) throw new Error("receipt_mismatch");
		const { nodeId, occurrenceKey, parentOccurrenceKey, phase, iterationPath } = observed;
		if (
			result.has(occurrenceKey) ||
			observed.kind !== "gate" ||
			observed.reviewArea !== request.reviewArea ||
			observed.actionKey !== request.actionKey ||
			!isDeepStrictEqual(request.occurrence, { nodeId, occurrenceKey, parentOccurrenceKey, phase, iterationPath }) ||
			!isDeepStrictEqual(request.deadlineRefs, observed.deadlineRefs) ||
			request.visit.diffId !== current.diffId ||
			request.visit.reviewedHead !== current.reviewedHead ||
			facts.native.some((fact) => fact.provenance.request.occurrenceKey === occurrenceKey) ||
			(facts.classification !== null &&
				protocolDigest(facts.classification.requestBytes) !== request.visit.classificationRequestDigest)
		) {
			throw new Error("receipt_mismatch");
		}
		result.set(occurrenceKey, request);
	}
	return result;
}
