import { expect, test } from "bun:test";
import { canonicalReviewClassificationRequest, protocolDigest, type ReviewWaitV1 } from "../../../langflowContracts";
import { project } from "../project.ts";
import { fixture } from "../testFixture.ts";

const run = (f: ReturnType<typeof fixture>) => project(f.view, f.observed, f.facts, f.binding, 6, f.now);

function reviewFixture() {
	const f = fixture();
	f.facts.native = [];
	f.view.diffId = "00000000000000000000000008";
	f.observed.status = "running";
	const occurrence = f.observed.occurrences[0]!;
	occurrence.kind = "gate";
	occurrence.reviewArea = "frontend";
	occurrence.state = "running";
	occurrence.acceptedResultId = null;
	occurrence.endedAt = null;
	const identity = {
		nodeId: occurrence.nodeId,
		occurrenceKey: occurrence.occurrenceKey,
		parentOccurrenceKey: occurrence.parentOccurrenceKey,
		phase: occurrence.phase,
		iterationPath: occurrence.iterationPath,
	};
	const classificationRequestId = "00000000-0000-4000-8000-000000000003";
	const classificationBytes = canonicalReviewClassificationRequest({
		version: 1,
		executionId: f.binding.executionId,
		publicationId: f.binding.publicationId,
		engineJobId: f.binding.engineJobId,
		classificationRequestId,
		diffId: f.view.diffId,
		reviewedHead: f.view.reviewedHead!,
		gates: [{ nodeId: occurrence.nodeId, reviewArea: "frontend" }],
	});
	const requestId = "00000000-0000-4000-8000-000000000002";
	const visit = {
		version: 1 as const,
		...f.binding,
		...identity,
		requestId,
		classificationRequestId,
		classificationRequestDigest: protocolDigest(classificationBytes),
		diffId: f.view.diffId,
		reviewedHead: f.view.reviewedHead!,
		specHash: "a".repeat(64),
	};
	const request: ReviewWaitV1 = {
		version: 1,
		...f.binding,
		occurrence: identity,
		engineRequestId: requestId,
		actionKey: occurrence.actionKey,
		reviewArea: "frontend",
		visit,
		visitDigest: protocolDigest(JSON.stringify(visit)),
		deadlineRefs: [],
	};
	f.observed.checkpoint.waits = [{ kind: "review", waitId: "review-wait", request }];
	f.facts.classification = {
		receiptId: "classification",
		ownerToken: "owner",
		requestBytes: classificationBytes,
		state: "claimed",
		binding: {
			executionId: f.view.id,
			publicationId: f.binding.publicationId,
			diffId: f.view.diffId,
			reviewedHead: f.view.reviewedHead!,
		},
		relevance: null,
		error: null,
	};
	return { f, request, occurrence };
}

test("an explicit review wait has no native attempt or human action", () => {
	const { f, occurrence } = reviewFixture();
	for (const receipt of [null, f.facts.classification]) {
		f.facts.classification = receipt;
		const view = run(f);
		expect(view).toMatchObject({ status: "waiting", detail: "waiting_review", decisionDeliveries: [] });
		expect(view.occurrences[0]).toMatchObject({
			state: "running",
			waitReason: "review",
			attempts: [],
			outputSource: null,
			decision: null,
		});
	}
	for (const state of ["failed", "canceled"] as const) {
		occurrence.state = state;
		expect(run(f).occurrences[0]).toMatchObject({ state, waitReason: null, decision: null });
	}
});

test("a completed classification remains pending until its exact engine acceptance", () => {
	const { f, occurrence } = reviewFixture();
	f.facts.classification!.state = "succeeded";
	f.facts.classification!.relevance = { frontend: false, backend: true };
	expect(run(f).detail).toBe("waiting_review");
	expect(run(f).occurrences[0]!.decision).toBeNull();
	f.observed.checkpoint.waits = [];
	occurrence.state = "succeeded";
	f.observed.status = "succeeded";
	for (const resultId of [null, "engine-acceptance-id", "different-classification"]) {
		occurrence.acceptedResultId = resultId;
		expect(run(f)).toMatchObject({ status: "waiting", detail: "unknown" });
		expect(run(f).occurrences[0]!.decision).toBeNull();
	}
	occurrence.acceptedResultId = "classification";
	expect(run(f)).toMatchObject({ status: "succeeded", detail: "completed" });
	expect(run(f).occurrences[0]).toMatchObject({
		decision: "no",
		output: '{"frontend":false,"backend":true}',
		outputSource: null,
		attempts: [],
	});
});

test("classification errors require acceptance before they end the occurrence", () => {
	const { f, occurrence } = reviewFixture();
	f.facts.classification!.state = "failed";
	f.facts.classification!.error = "provider_failure";
	expect(run(f).detail).toBe("waiting_review");
	f.observed.checkpoint.waits = [];
	expect(run(f).occurrences[0]!.state).toBe("unknown");
	occurrence.acceptedResultId = "classification";
	expect(run(f).occurrences[0]).toMatchObject({ state: "failed", error: "provider_failure", decision: null });
});

test("review wait checks exact occurrence, action, area, deadlines and classification bytes", () => {
	const changes: ((f: ReturnType<typeof reviewFixture>) => void)[] = [
		({ occurrence }) => {
			occurrence.actionKey = "other-action";
		},
		({ occurrence }) => {
			occurrence.reviewArea = "backend";
		},
		({ occurrence }) => {
			occurrence.iterationPath = [{ loopNodeId: "other-group", round: 2 }];
		},
		({ occurrence }) => {
			occurrence.deadlineRefs = ["different-deadline"];
		},
		({ request }) => {
			request.visit.diffId = "00000000000000000000000009";
		},
		({ request }) => {
			request.visit.reviewedHead = "b".repeat(40);
		},
		({ f }) => {
			f.facts.classification!.requestBytes = "changed";
		},
		({ f }) => {
			f.observed.occurrences = [];
		},
		({ f }) => {
			f.observed.checkpoint.waits.push({ ...f.observed.checkpoint.waits[0]!, waitId: "duplicate" });
		},
	];
	for (const change of changes) {
		const fixture = reviewFixture();
		change(fixture);
		expect(() => run(fixture.f)).toThrow("receipt_mismatch");
	}
});

test("a retained review wait cannot grant completion or discard history", () => {
	const { f, occurrence } = reviewFixture();
	const prior = run(f);
	f.view = prior;
	f.observed.expectedRevision = prior.revision;
	f.observed.status = "succeeded";
	occurrence.state = "succeeded";
	occurrence.acceptedResultId = "classification";
	expect(run(f).status).toBe("waiting");
	expect(run(f).occurrences[0]!.decision).toBeNull();
	expect(run(f).occurrences[0]!.endedAt).toBeNull();
	f.observed.checkpoint.waits = [];
	f.observed.occurrences = [];
	expect(() => run(f)).toThrow("incomplete_snapshot");
});
