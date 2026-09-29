import { expect, test } from "bun:test";
import {
	FlowDocumentV1Schema,
	FlowExecutionViewV1Schema as PublicViewSchema,
	executionViewV1Example as rootExample,
} from "../index.ts";
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
	FlowOccurrenceV1Schema,
	FlowStopObligationV1Schema,
	FlowSubmissionV1Schema,
} from "./flowExecutionViewV1.ts";
import {
	executionViewV1Example,
	flowV1FixtureIds,
	flowV1Time,
	legacyDocumentV1Example,
	legacyExecutionViewV1Example,
	occurrenceV1Example,
	pendingDocumentV1Example,
	retainedOutputV1Example,
	stopPendingV1Example,
	unknownAdmissionV1Example,
	unknownDecisionV1Example,
} from "./flowV1Fixtures.ts";
import { executionViewV1Example as schemasExample } from "./index.ts";

test("legacy history preserves unknown kind and native output provenance", () => {
	const value = FlowExecutionViewV1Schema.parse(legacyExecutionViewV1Example);
	expect(value.occurrences[0]?.kind).toBeNull();
	expect(value.occurrences[0]?.output).toBe(legacyExecutionViewV1Example.occurrences[0]?.output);
	expect(value.occurrences[0]?.outputSource).toBeNull();
});

test("native output identifies its retained result even with a later attempt", () => {
	const value = FlowExecutionViewV1Schema.parse({
		...executionViewV1Example,
		occurrences: [retainedOutputV1Example],
	});
	expect(value.occurrences[0]?.kind).toBe("agent");
	expect(value.occurrences[0]?.outputSource?.attemptId).toBe("attempt-37");
	expect(value.occurrences[0]?.attempts.at(-1)?.attemptId).toBe("attempt-38");
	for (const change of [
		{ stepId: "other-step" },
		{ agentRunId: flowV1FixtureIds.ticket },
		{ attemptId: "attempt-38" },
		{ resultId: "other-result" },
	]) {
		expect(
			FlowOccurrenceV1Schema.safeParse({
				...retainedOutputV1Example,
				outputSource: { ...retainedOutputV1Example.outputSource, ...change },
			}).success,
		).toBe(false);
	}
	expect(FlowOccurrenceV1Schema.safeParse({ ...retainedOutputV1Example, output: null }).success).toBe(false);
});

test("occurrence metadata accepts every archived kind and rejects untyped source data", () => {
	for (const kind of ["agent", "gate", "human", "group", "loop", null] as const) {
		expect(FlowOccurrenceV1Schema.parse({ ...occurrenceV1Example, kind }).kind).toBe(kind);
	}
	for (const change of [{ kind: "code" }, { outputSource: { attemptId: "attempt-37" } }]) {
		expect(FlowOccurrenceV1Schema.safeParse({ ...occurrenceV1Example, ...change }).success).toBe(false);
	}
});

test("a reserved submission retains an unknown epoch until admission opens", () => {
	const reservation = {
		...executionViewV1Example.submission!,
		state: "reserved" as const,
		admission: "closed" as const,
		engineJobId: null,
		engineEpoch: null,
		ownership: "unknown" as const,
	};
	expect(FlowSubmissionV1Schema.parse(reservation).engineEpoch).toBeNull();
	expect(FlowSubmissionV1Schema.safeParse({ ...reservation, ownership: "confirmed" }).success).toBe(false);
	expect(
		FlowSubmissionV1Schema.safeParse({
			...reservation,
			state: "submitted",
			admission: "open",
			ownership: "confirmed",
			engineJobId: "job",
		}).success,
	).toBe(false);
});

test("the package exports public schemas and consumer examples", () => {
	expect(rootExample).toBe(executionViewV1Example);
	expect(schemasExample).toBe(executionViewV1Example);
	expect(new Set(Object.values(flowV1FixtureIds)).size).toBe(Object.keys(flowV1FixtureIds).length);
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
		FlowOccurrenceIdentityV1Schema.parse({ ...identity, iterationPath: [{ loopNodeId: "outer", round: 51 }] })
			.iterationPath[0]?.round,
	).toBe(51);
	expect(
		FlowOccurrenceIdentityV1Schema.safeParse({ ...identity, iterationPath: [{ loopNodeId: "outer", round: 0 }] })
			.success,
	).toBe(false);
});

test("a reservation cannot supply a group deadline without an observed launch", () => {
	const deadline = { deadlineId: "deadline-37", groupOccurrenceKey: "loop-1:37", launchedAt: null, deadlineAt: null };
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
	const input = {
		id: flowV1FixtureIds.execution,
		key: "review-37",
		approved: true,
		output: "Approved.",
		expectedRevision: 7,
	};
	expect(FlowExecutionDecisionInputSchema.parse(input).expectedRevision).toBe(7);
	expect(FlowExecutionDecisionInputSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(false);
	expect(FlowExecutionDecisionInputSchema.safeParse({ ...input, decisionId: "new-key" }).success).toBe(false);
	expect(
		FlowExecutionCancelInputSchema.parse({ id: flowV1FixtureIds.execution, expectedRevision: 7 }).expectedRevision,
	).toBe(7);
	expect(FlowExecutionCancelInputSchema.safeParse({ id: flowV1FixtureIds.execution }).success).toBe(false);
	const view = FlowExecutionViewV1Schema.parse({
		...executionViewV1Example,
		decisionDeliveries: [unknownDecisionV1Example],
	});
	expect(input.expectedRevision).toBeLessThan(view.revision);
});

test("legacy execution filters retain pagination beyond 500 results", () => {
	const input = { flow: "review", ticket: "TRL-665", diffId: flowV1FixtureIds.diff, limit: 500, offset: 500 };
	expect(FlowExecutionListInputSchema.parse(input)).toEqual(input);
});

test("reviewedHead preserves legacy caller values while workspace commits remain exact", () => {
	for (const reviewedHead of ["6830428", "refs/heads/main", "f".repeat(40), "a".repeat(64), null]) {
		expect(FlowExecutionViewV1Schema.parse({ ...executionViewV1Example, reviewedHead }).reviewedHead).toBe(
			reviewedHead,
		);
	}
	const attempt = occurrenceV1Example.attempts[0];
	const occurrence = { ...occurrenceV1Example, attempts: [{ ...attempt, workspaceCommit: "6830428" }] };
	expect(FlowExecutionViewV1Schema.safeParse({ ...executionViewV1Example, occurrences: [occurrence] }).success).toBe(
		false,
	);
	for (const workspaceCommit of ["f".repeat(40), "a".repeat(64), null]) {
		const value = FlowExecutionViewV1Schema.parse({
			...executionViewV1Example,
			occurrences: [{ ...occurrence, attempts: [{ ...attempt, workspaceCommit }] }],
		});
		expect(value.occurrences[0]?.attempts[0]?.workspaceCommit).toBe(workspaceCommit);
	}
});
