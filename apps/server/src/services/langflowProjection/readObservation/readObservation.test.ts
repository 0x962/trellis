import { expect, test } from "bun:test";
import { protocolDigest, type EngineProjectionSnapshotV1 } from "../../../langflowContracts";
import { documentBytes } from "../../flowDocuments";
import { retainedPublication } from "../../flowDocuments/readExecutionPublication/fixture";
import { readObservation } from "./readObservation";

function fixture() {
	const execution = retainedPublication();
	if (execution.snapshot.engine !== "langflow") throw new Error("fixture_engine");
	const spec = { nodeId: "human", taskKeyBase: "human", name: "Approval", instruction: "Read all feedback.", harness: null };
	execution.snapshot.graphDocument = { nodes: [{ id: "vertex", data: { type: "TrellisHumanDecisionV1" } }],
		trellisRequestSpecsV1: { vertex: spec } };
	execution.submissionBytes = JSON.stringify({ publication: execution.publication, snapshot: execution.snapshot });
	execution.submission.submissionDigest = protocolDigest(execution.submissionBytes);
	const binding = { executionId: execution.executionId, publicationId: execution.publicationId,
		engineJobId: "00000000-0000-4000-8000-000000000001", engineEpoch: 1 };
	const occurrence = { nodeId: "human", occurrenceKey: "second", parentOccurrenceKey: null, phase: "step", iterationPath: [] };
	const wait = { version: 1, ...binding, occurrence, engineRequestId: "request-2", actionKey: "action-2", expectedRevision: 2,
		deadlineRefs: [] };
	const lifecycle = { state: "waiting_human", acceptedResultId: null, startedAt: null, endedAt: null, error: null, skipReason: null };
	const prior = { occurrence: { ...occurrence, occurrenceKey: "first" }, requestBytes: JSON.stringify({ ...wait,
		occurrence: { ...occurrence, occurrenceKey: "first" }, engineRequestId: "request-1", actionKey: "action-1", expectedRevision: 1 }),
		projection: { ...lifecycle, state: "skipped", acceptedResultId: "decision-1", skipReason: "human_feedback_replaced",
			endedAt: "2026-09-29T00:00:00.000Z" } };
	const journal = { revision: 2, visits: { visit: { vertexId: "vertex", kind: "human", occurrence,
		specHash: protocolDigest(documentBytes(spec).toString("utf8")), requestBytes: JSON.stringify(wait),
		projection: lifecycle, prior: [prior] } } };
	const snapshot: EngineProjectionSnapshotV1 = { version: 1, ...binding, sourceCursor: 1,
		capturedAt: "2026-09-29T00:00:00.000Z", checkpointBytes: JSON.stringify({ version: 1, ...binding,
			checkpointId: "checkpoint", revision: 1, continuationRef: "graph", waits: [] }),
		graphCheckpointBytes: "{}", occurrenceJournalBytes: JSON.stringify(journal), jobStatus: "suspended", jobOutcomeBytes: null };
	return { execution, snapshot, journal };
}

test("NO history retains distinct identities at the same engine scope", () => {
	const f = fixture();
	const observed = readObservation(f.execution, f.snapshot, 42);
	expect(observed.expectedRevision).toBe(42);
	expect(observed.occurrences.map((row) => [row.occurrenceKey, row.state, row.acceptedResultId, row.startedAt]))
		.toEqual([["first", "skipped", "decision-1", null], ["second", "waiting_human", null, null]]);
	expect(observed.occurrences.map((row) => row.actionKey)).toEqual(["action-1", "action-2"]);
});

test("an altered archived instruction fails the retained spec digest", () => {
	const f = fixture();
	f.journal.visits.visit.specHash = "0".repeat(64);
	f.snapshot.occurrenceJournalBytes = JSON.stringify(f.journal);
	expect(() => readObservation(f.execution, f.snapshot, 1)).toThrow("projection_spec_conflict");
});

test("container facts without durable occurrence history stay explicit", () => {
	const f = fixture();
	f.snapshot.graphCheckpointBytes = JSON.stringify({ trellis_loop_visits: { one: { phase: "completed" } } });
	expect(() => readObservation(f.execution, f.snapshot, 1)).toThrow("projection_container_history_missing");
});
