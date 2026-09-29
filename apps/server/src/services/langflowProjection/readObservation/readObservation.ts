import { isDeepStrictEqual } from "node:util";
import { FlowStepStateSchema, IsoDateTimeSchema } from "@trellis/api";
import { z } from "zod";
import {
	EngineCheckpointV1Schema,
	EngineProjectionOutcomeV1Schema,
	type EngineProjectionSnapshotV1,
	HumanWaitV1Schema,
	NativeRequestV1Schema,
	OccurrenceV1Schema,
	protocolDigest,
	ReviewWaitV1Schema,
} from "../../../langflowContracts";
import { documentBytes, readExecutionPublication, type RetainedExecutionPublication } from "../../flowDocuments";
import { type ObservedOccurrence, ProjectionObservationSchema } from "../observation";

const projection = z.strictObject({
	state: FlowStepStateSchema,
	acceptedResultId: z.string().nullable(),
	startedAt: IsoDateTimeSchema.nullable(),
	endedAt: IsoDateTimeSchema.nullable(),
	error: z.string().nullable(),
	skipReason: z.string().nullable(),
});
const priorVisit = z.looseObject({
	occurrence: OccurrenceV1Schema,
	requestBytes: z.string(),
	projection: projection.optional(),
});
const visit = priorVisit.extend({
	vertexId: z.string(),
	specHash: z.string(),
	kind: z.enum(["native", "human"]),
	prior: z.array(priorVisit),
});
const reviewVisit = z.looseObject({
	vertexId: z.string(),
	specHash: z.string(),
	waitBytes: z.string(),
	acceptedResultId: z.string().nullable(),
	projection: projection.optional(),
});
const journalSchema = z.looseObject({
	revision: z.int().nonnegative(),
	visits: z.record(z.string(), visit),
	reviewVisits: z.record(z.string(), reviewVisit).optional(),
});
const graphSchema = z.looseObject({
	nodes: z.array(z.looseObject({ id: z.string(), data: z.looseObject({ type: z.string() }) })),
	trellisRequestSpecsV1: z.record(z.string(), z.json()).optional(),
	trellisReviewGatesV1: z.record(z.string(), z.json()).optional(),
});
const specSchema = z.looseObject({ nodeId: z.string(), name: z.string(), instruction: z.string() });
const gateSpecSchema = z.strictObject({ nodeId: z.string(), reviewArea: z.enum(["frontend", "backend"]) });
const observedFacts = (value: z.infer<typeof projection> | undefined, acceptedResultId: string | null = null): z.infer<typeof projection> =>
	value ?? { state: "unknown", acceptedResultId, startedAt: null, endedAt: null, error: null, skipReason: null };
const nodeKinds = new Map<string, ObservedOccurrence["kind"]>([
	["TrellisNativeAgentV1", "agent"],
	["TrellisHumanDecisionV1", "human"],
	["TrellisNativeDecisionV1", "gate"],
	["TrellisReviewGateV1", "gate"],
]);

export function readObservation(
	execution: RetainedExecutionPublication,
	snapshot: EngineProjectionSnapshotV1,
	expectedRevision: number,
) {
	const publication = readExecutionPublication(execution);
	const graph = graphSchema.parse(publication.graphDocument);
	const archivedKind = (vertexId: string) => {
		const nodes = graph.nodes.filter((node) => node.id === vertexId);
		const kind = nodes.length === 1 ? nodeKinds.get(nodes[0]!.data.type) : undefined;
		if (kind === undefined) throw new Error("projection_node_metadata_missing");
		return kind;
	};
	const binding = (request: { executionId: string; publicationId: string; engineJobId: string; engineEpoch: number }) => {
		if (request.executionId !== execution.executionId || request.publicationId !== execution.publicationId ||
			request.engineJobId !== snapshot.engineJobId || request.engineEpoch > snapshot.engineEpoch)
			throw new Error("projection_occurrence_binding_conflict");
	};
	const rows: ObservedOccurrence[] = [];
	if (snapshot.occurrenceJournalBytes !== null) {
		const journal = journalSchema.parse(JSON.parse(snapshot.occurrenceJournalBytes));
		for (const current of Object.values(journal.visits)) {
			const rawSpec = graph.trellisRequestSpecsV1?.[current.vertexId];
			const spec = specSchema.parse(rawSpec);
			if (protocolDigest(documentBytes(rawSpec).toString("utf8")) !== current.specHash)
				throw new Error("projection_spec_conflict");
			const kind = archivedKind(current.vertexId);
			if ((current.kind === "human") !== (kind === "human")) throw new Error("projection_kind_conflict");
			for (const item of [...current.prior, current]) {
				const rawRequest: unknown = JSON.parse(item.requestBytes);
				const request = current.kind === "human" ? HumanWaitV1Schema.parse(rawRequest) : NativeRequestV1Schema.parse(rawRequest);
				binding(request);
				const occurrence = "occurrence" in request ? request.occurrence : OccurrenceV1Schema.parse({
					nodeId: request.nodeId, occurrenceKey: request.occurrenceKey, parentOccurrenceKey: request.parentOccurrenceKey,
					phase: request.phase, iterationPath: request.iterationPath,
				});
				if (!isDeepStrictEqual(occurrence, item.occurrence) || occurrence.nodeId !== spec.nodeId)
					throw new Error("projection_occurrence_identity_conflict");
				rows.push({ ...occurrence, ...observedFacts(item.projection), kind, reviewArea: null, title: spec.name,
					instruction: spec.instruction, actionKey: "actionKey" in request ? request.actionKey : request.requestId,
					deadlineRefs: "deadlineRefs" in request ? request.deadlineRefs : request.groupDeadlineRefs });
			}
		}
		for (const item of Object.values(journal.reviewVisits ?? {})) {
			const rawSpec = graph.trellisReviewGatesV1?.[item.vertexId];
			const spec = gateSpecSchema.parse(rawSpec);
			const wait = z.looseObject({ request: ReviewWaitV1Schema }).parse(JSON.parse(item.waitBytes)).request;
			binding(wait);
			if (archivedKind(item.vertexId) !== "gate" || spec.nodeId !== wait.occurrence.nodeId ||
				spec.reviewArea !== wait.reviewArea || observedFacts(item.projection, item.acceptedResultId).acceptedResultId !== item.acceptedResultId ||
				protocolDigest(documentBytes(rawSpec).toString("utf8")) !== item.specHash)
				throw new Error("projection_review_identity_conflict");
			rows.push({ ...wait.occurrence, ...observedFacts(item.projection, item.acceptedResultId), kind: "gate", reviewArea: spec.reviewArea,
				title: spec.nodeId, instruction: "", actionKey: wait.actionKey, deadlineRefs: wait.deadlineRefs });
		}
	}
	const savedGraph = z.record(z.string(), z.json()).parse(JSON.parse(snapshot.graphCheckpointBytes));
	for (const key of ["trellis_loop_visits", "group_visit_scopes"])
		if (savedGraph[key] !== undefined && Object.keys(z.record(z.string(), z.json()).parse(savedGraph[key])).length > 0)
			throw new Error("projection_container_history_missing");
	const outcome = snapshot.jobOutcomeBytes === null ? null : EngineProjectionOutcomeV1Schema.parse(JSON.parse(snapshot.jobOutcomeBytes));
	return ProjectionObservationSchema.parse({
		expectedRevision,
		checkpoint: EngineCheckpointV1Schema.parse(JSON.parse(snapshot.checkpointBytes)),
		status: outcome?.status ?? (snapshot.jobStatus === "queued" ? "queued" : "running"),
		failure: outcome?.failure ?? null,
		occurrences: rows,
	});
}
