import { expect, test } from "bun:test";
import { FlowDocumentV1Schema, FlowExecutionViewV1Schema as PublicViewSchema } from "../index.ts";
import {
	FlowExecutionCancelInputSchema,
	FlowExecutionDecisionInputSchema,
	FlowExecutionListInputSchema,
	FlowExecutionStateSchema,
} from "./flowExecution.ts";
import {
	FlowDeadlineV1Schema,
	FlowDecisionDeliveryV1Schema,
	FlowExecutionViewV1Schema,
	FlowOccurrenceIdentityV1Schema,
	FlowStopObligationV1Schema,
	FlowSubmissionV1Schema,
} from "./flowExecutionViewV1.ts";
import {
	executionViewV1Example,
	flowV1Id,
	flowV1Time,
	legacyDocumentV1Example,
	occurrenceV1Example,
	pendingDocumentV1Example,
	stopPendingV1Example,
	unknownAdmissionV1Example,
	unknownDecisionV1Example,
} from "./flowV1Fixtures.ts";

test("the package root exports both public schemas", () => {
	expect(PublicViewSchema).toBe(FlowExecutionViewV1Schema);
	expect(FlowDocumentV1Schema.parse(pendingDocumentV1Example).revision).toBe(2);
});

test("both engines preserve the five public execution states", () => {
	const { publication: _publication, lastExecutablePublication: _executable, ...snapshot } = legacyDocumentV1Example;
	const legacy = {
		...executionViewV1Example,
		engine: "legacy" as const,
		snapshot,
		publication: null,
		submission: null,
	};
	expect(FlowExecutionViewV1Schema.parse(legacy)).toEqual(legacy);
	for (const status of ["running", "waiting", "succeeded", "failed", "canceled"] as const) {
		expect(FlowExecutionStateSchema.shape.status.parse(status)).toBe(status);
	}
	for (const status of ["queued", "submission_unknown", "stop_pending"]) {
		expect(FlowExecutionViewV1Schema.safeParse({ ...legacy, status }).success).toBe(false);
	}
});

test("unknown submission retains closed admission and no fabricated job", () => {
	const value = FlowExecutionViewV1Schema.parse(unknownAdmissionV1Example);
	expect(value.submission?.admission).toBe("closed");
	expect(value.submission?.engineJobId).toBeNull();
	expect(value.detail).toBe("unknown");
	for (const change of [{ admission: "open" }, { state: "submitted" }]) {
		expect(FlowSubmissionV1Schema.safeParse({ ...value.submission, ...change }).success).toBe(false);
	}
});

test("unknown ownership closes admission even when a job identity exists", () => {
	expect(FlowSubmissionV1Schema.safeParse({ ...executionViewV1Example.submission, ownership: "unknown" }).success).toBe(
		false,
	);
});

test("immutable run history does not require the current saved revision", () => {
	const value = FlowExecutionViewV1Schema.parse(executionViewV1Example);
	expect(value.snapshot.revision).toBe(2);
	expect(value.revision).toBe(8);
	for (const publication of [
		null,
		{ ...value.publication, revision: 3 },
		{ ...value.publication, documentHash: "0".repeat(64) },
	]) {
		expect(FlowExecutionViewV1Schema.safeParse({ ...value, publication }).success).toBe(false);
	}
	expect(FlowExecutionViewV1Schema.safeParse({ ...value, engine: "legacy" }).success).toBe(false);
});

test("review target and unknown workspace commit remain separate", () => {
	const value = FlowExecutionViewV1Schema.parse({ ...executionViewV1Example, occurrences: [occurrenceV1Example] });
	expect(value.reviewedHead).toBe("f".repeat(40));
	expect(value.occurrences[0]?.attempts[0]?.workspaceCommit).toBeNull();
	expect(value.occurrences[0]?.attempts[0]?.attemptId).toBe("attempt-37");
});

test("nested rounds and condition phases preserve the occurrence identity", () => {
	const { nodeId, occurrenceKey, parentOccurrenceKey } = occurrenceV1Example;
	const identity = {
		nodeId,
		occurrenceKey,
		parentOccurrenceKey,
		phase: "condition" as const,
		iterationPath: [
			{ loopNodeId: "outer", round: 37 },
			{ loopNodeId: "inner", round: 2 },
		],
	};
	expect(FlowOccurrenceIdentityV1Schema.parse(identity)).toEqual(identity);
	expect(
		FlowOccurrenceIdentityV1Schema.safeParse({ ...identity, iterationPath: [{ loopNodeId: "outer", round: 51 }] })
			.success,
	).toBe(false);
});

test("a reservation cannot supply a group deadline without an observed launch", () => {
	const deadline = { deadlineId: "deadline-37", groupOccurrenceKey: "loop-1/37", launchedAt: null, deadlineAt: null };
	expect(FlowDeadlineV1Schema.parse(deadline)).toEqual(deadline);
	expect(FlowDeadlineV1Schema.safeParse({ ...deadline, deadlineAt: flowV1Time }).success).toBe(false);
});

test("cancellation keeps the exact pending stop until exit confirmation", () => {
	const value = FlowExecutionViewV1Schema.parse(stopPendingV1Example);
	expect(value.status).toBe("canceled");
	expect(value.stopObligations[0]?.attemptId).toBe("attempt-37");
	const stop = value.stopObligations[0];
	expect(FlowStopObligationV1Schema.safeParse({ ...stop, state: "confirmed" }).success).toBe(false);
	expect(FlowStopObligationV1Schema.parse({ ...stop, state: "confirmed", confirmedAt: flowV1Time }).state).toBe(
		"confirmed",
	);
});

test("an unknown decision keeps notes and requires an acceptance receipt for confirmation", () => {
	const value = FlowDecisionDeliveryV1Schema.parse(unknownDecisionV1Example);
	expect(value.output).toBe(unknownDecisionV1Example.output);
	expect(value.expectedRevision).toBe(7);
	expect(FlowDecisionDeliveryV1Schema.safeParse({ ...value, state: "confirmed" }).success).toBe(false);
	expect(
		FlowDecisionDeliveryV1Schema.parse({
			...value,
			state: "confirmed",
			acceptedReceiptId: "receipt-37",
			confirmedAt: flowV1Time,
		}).state,
	).toBe("confirmed");
});

test("decision and cancellation preserve expectedRevision for the service stale-action check", () => {
	const input = { id: flowV1Id, key: "review-37", approved: true, output: "Approved.", expectedRevision: 7 };
	expect(FlowExecutionDecisionInputSchema.parse(input).expectedRevision).toBe(7);
	expect(FlowExecutionDecisionInputSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(false);
	expect(FlowExecutionDecisionInputSchema.safeParse({ ...input, decisionId: "new-key" }).success).toBe(false);
	expect(FlowExecutionCancelInputSchema.parse({ id: flowV1Id, expectedRevision: 7 }).expectedRevision).toBe(7);
	expect(FlowExecutionCancelInputSchema.safeParse({ id: flowV1Id }).success).toBe(false);
	const view = FlowExecutionViewV1Schema.parse({
		...executionViewV1Example,
		decisionDeliveries: [unknownDecisionV1Example],
	});
	expect(input.expectedRevision).toBeLessThan(view.revision);
});

test("legacy execution filters retain pagination beyond 500 results", () => {
	const input = { flow: "review", ticket: "TRL-665", diffId: flowV1Id, limit: 500, offset: 500 };
	expect(FlowExecutionListInputSchema.parse(input)).toEqual(input);
});
