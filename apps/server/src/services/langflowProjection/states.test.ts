import { expect, test } from "bun:test";
import { type HumanDeliveryV1, protocolDigest } from "../../langflowContracts";
import { project } from "./project.ts";
import { fixture } from "./testFixture.ts";

const run = (f: ReturnType<typeof fixture>) => project(f.view, f.observed, f.facts, f.binding, 6, f.now);

function humanFixture() {
	const f = fixture();
	f.facts.native = [];
	const occurrence = f.observed.occurrences[0]!;
	occurrence.kind = "human";
	occurrence.state = "waiting_human";
	occurrence.acceptedResultId = null;
	f.observed.status = "running";
	const delivery: HumanDeliveryV1 = {
		version: 1,
		state: "pending",
		acceptance: null,
		payloadDigest: "d".repeat(64),
		decision: {
			version: 1,
			decisionId: "decision",
			actor: { kind: "human", name: "reviewer" },
			approved: true,
			output: "Retained notes.",
			recordedAt: f.now.toISOString(),
			wait: {
				version: 1,
				...f.binding,
				occurrence: {
					nodeId: occurrence.nodeId,
					occurrenceKey: occurrence.occurrenceKey,
					parentOccurrenceKey: occurrence.parentOccurrenceKey,
					phase: occurrence.phase,
					iterationPath: occurrence.iterationPath,
				},
				engineRequestId: "request",
				actionKey: occurrence.actionKey,
				expectedRevision: f.view.revision,
				deadlineRefs: [],
			},
		},
	};
	return { f, delivery };
}

test("human wait is distinct from native wait", () => {
	const { f } = humanFixture();
	expect(run(f)).toMatchObject({ status: "waiting", detail: "waiting_human" });
	const native = fixture();
	native.observed.status = "running";
	native.observed.occurrences[0]!.state = "running";
	native.facts.native[0]!.completion = null;
	native.facts.native[0]!.handle.state = "running";
	expect(run(native)).toMatchObject({ status: "waiting", detail: "waiting_native" });
});

test("pending and unknown human delivery retain notes without approval", () => {
	const { f, delivery } = humanFixture();
	f.facts.human = [delivery];
	expect(run(f).decisionDeliveries[0]).toMatchObject({
		state: "pending",
		output: "Retained notes.",
		acceptedReceiptId: null,
	});
	expect(run(f).occurrences[0]!.decision).toBeNull();
	f.facts.human = [{ ...delivery, state: "unknown", acceptance: null }];
	expect(run(f)).toMatchObject({ status: "waiting", detail: "unknown" });
});

test("confirmed human delivery requires the exact engine acceptance", () => {
	const { f, delivery } = humanFixture();
	f.facts.human = [
		{
			...delivery,
			state: "confirmed",
			acceptance: {
				version: 1,
				executionId: f.binding.executionId,
				engineJobId: f.binding.engineJobId,
				engineRequestId: "request",
				decisionId: "decision",
				payloadDigest: delivery.payloadDigest,
				acceptanceId: "accepted",
				signalId: "signal",
				enqueueObligationId: "enqueue",
				acceptedAt: f.now.toISOString(),
			},
		},
	];
	f.observed.status = "succeeded";
	f.observed.occurrences[0]!.state = "succeeded";
	expect(run(f).status).toBe("waiting");
	f.observed.occurrences[0]!.acceptedResultId = "decision";
	expect(run(f).status).toBe("succeeded");
	expect(run(f).decisionDeliveries[0]).toMatchObject({
		acceptedReceiptId: "accepted",
		confirmedAt: f.now.toISOString(),
	});
});

test("queued, active and canceled states retain their public detail", () => {
	const f = fixture();
	f.facts.native = [];
	f.observed.occurrences = [];
	for (const [status, detail] of [
		["queued", "queued"],
		["running", "active"],
		["canceled", "canceled"],
	] as const) {
		f.observed.status = status;
		expect(run(f).detail).toBe(detail);
	}
});

test("an accepted Jev result uses its stored area decision", () => {
	const f = fixture();
	f.facts.native = [];
	f.view.diffId = "00000000000000000000000008";
	f.facts.classification = {
		receiptId: "classification",
		ownerToken: "owner",
		requestBytes: "{}",
		state: "succeeded",
		binding: {
			executionId: f.view.id,
			publicationId: f.binding.publicationId,
			diffId: f.view.diffId,
			reviewedHead: f.view.reviewedHead!,
		},
		relevance: { frontend: false, backend: true },
		error: null,
	};
	const occurrence = f.observed.occurrences[0]!;
	occurrence.kind = "gate";
	occurrence.reviewArea = "frontend";
	occurrence.acceptedResultId = "classification";
	expect(run(f).occurrences[0]).toMatchObject({
		state: "succeeded",
		decision: "no",
		output: '{"frontend":false,"backend":true}',
		outputSource: null,
	});
	f.facts.classification.binding.reviewedHead = "0".repeat(40);
	expect(() => run(f)).toThrow("receipt_mismatch");
});

test("dense occurrence history has no item ceiling", () => {
	const f = fixture();
	f.facts.native = [];
	const occurrence = f.observed.occurrences[0]!;
	f.observed.occurrences = Array.from({ length: 2101 }, (_, i) => ({
		...occurrence,
		kind: "group",
		nodeId: `node-${i}`,
		occurrenceKey: `group-${i}`,
		actionKey: `action-${i}`,
	}));
	expect(run(f).occurrences).toHaveLength(2101);
});

test("token payloads cannot enter the state journal", async () => {
	const { SourceEventV1Schema } = await import("../../langflowContracts");
	const f = fixture();
	expect(
		SourceEventV1Schema.safeParse({
			version: 1,
			...f.binding,
			sourceEventId: "token",
			occurredAt: f.now.toISOString(),
			occurrence: null,
			payload: { kind: "token", text: "complete retained bytes", hash: protocolDigest("complete retained bytes") },
		}).success,
	).toBe(false);
});
