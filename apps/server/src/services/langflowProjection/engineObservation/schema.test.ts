import { expect, test } from "bun:test";
import { type SourceEventV1, SourceEventV1Schema } from "../../../langflowContracts";
import { type EngineProjectionSnapshotV1, EngineProjectionSnapshotV1Schema } from "./schema.ts";

const binding = {
	executionId: "execution-1",
	publicationId: "publication-1",
	engineJobId: "00000000-0000-4000-8000-000000000001",
	engineEpoch: 1,
};

test("checkpoint events describe the snapshot without an invented occurrence", () => {
	const event: SourceEventV1 = {
		version: 1,
		...binding,
		sourceEventId: "checkpoint-1",
		occurredAt: "2026-09-29T00:00:00.000Z",
		occurrence: null,
		payload: { kind: "checkpoint_saved", receiptId: "checkpoint-1" },
	};
	expect(SourceEventV1Schema.parse(event)).toEqual(event);
	expect(SourceEventV1Schema.safeParse({ ...event, occurrence: {} }).success).toBe(false);
});

test("snapshots preserve raw checkpoint strings and unknown outcome", () => {
	const snapshot: EngineProjectionSnapshotV1 = {
		version: 1,
		...binding,
		sourceCursor: 9000,
		capturedAt: "2026-09-29T00:00:00.000Z",
		checkpointBytes: ` ${JSON.stringify({
			version: 1,
			...binding,
			checkpointId: "checkpoint-1",
			revision: 9000,
			continuationRef: "graph-row",
			waits: [],
		})} `,
		graphCheckpointBytes: ' {"external_waits":{}} ',
		occurrenceJournalBytes: null,
		jobStatus: "in_progress",
		jobOutcomeBytes: null,
	};
	expect(EngineProjectionSnapshotV1Schema.parse(snapshot)).toEqual(snapshot);
});
