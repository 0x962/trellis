import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { z } from "zod";
import * as contracts from "./index";

const schemas = {
	correlation: contracts.CorrelationReceiptV1Schema,
	admission: contracts.AdmissionReceiptV1Schema,
	submission: contracts.SubmissionV1Schema,
	"native-request": contracts.NativeRequestV1Schema,
	"native-handle": contracts.NativeHandleV1Schema,
	"launch-provenance": contracts.NativeLaunchProvenanceV1Schema,
	"launch-receipt": contracts.NativeLaunchReceiptV1Schema,
	"native-result": contracts.NativeResultV1Schema,
	"native-completion": contracts.NativeCompletionV1Schema,
	authority: contracts.DeliveryAuthorityV1Schema,
	"completion-delivery": contracts.CompletionDeliveryV1Schema,
	"completion-receipt": contracts.CompletionReceiptV1Schema,
	takeover: contracts.TakeoverReceiptV1Schema,
	renewal: contracts.RenewalReceiptV1Schema,
	"human-wait": contracts.HumanWaitV1Schema,
	"human-decision": contracts.HumanDecisionReceiptV1Schema,
	"decision-acceptance": contracts.DecisionAcceptanceV1Schema,
	"human-delivery": contracts.HumanDeliveryV1Schema,
	"decision-delivery": contracts.DecisionDeliveryV1Schema,
	checkpoint: contracts.EngineCheckpointV1Schema,
	stop: contracts.StopObligationV1Schema,
	"source-event": contracts.SourceEventV1Schema,
	event: contracts.ExecutionEventV1Schema,
	replay: contracts.EventReplayV1Schema,
	"replay-gap": contracts.EventReplayV1Schema,
} satisfies Record<string, z.ZodType>;
const bytes = (name: keyof typeof schemas) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const fixture = <K extends keyof typeof schemas>(name: K) =>
	schemas[name].parse(JSON.parse(bytes(name))) as z.infer<(typeof schemas)[K]>;

describe("serialized version 1 protocol", () => {
	for (const [name, schema] of Object.entries(schemas)) {
		test(`${name}: accepts original bytes and rejects identity reuse with changed bytes`, () => {
			const text = bytes(name as keyof typeof schemas);
			const digest = contracts.protocolDigest(text);
			expect(contracts.readProtocolBytes(schema as z.ZodType, text, digest)).toEqual(JSON.parse(text));
			expect(() => contracts.readProtocolBytes(schema as z.ZodType, `${text} `, digest)).toThrow("identity_conflict");
			expect(schema.safeParse({ ...JSON.parse(text), version: 2 }).success).toBe(false);
			expect(schema.safeParse({ ...JSON.parse(text), providerToken: "forged" }).success).toBe(false);
		});
	}
});

test("admission requires an exact durable job association", () => {
	const submission = fixture("submission");
	expect(contracts.SubmissionV1Schema.safeParse({ ...submission, correlation: null }).success).toBe(false);
	expect(
		contracts.SubmissionV1Schema.safeParse({
			...submission,
			correlation: { ...submission.correlation, engineJobId: "00000000-0000-4000-8000-000000000099" },
		}).success,
	).toBe(false);
	expect(
		contracts.SubmissionV1Schema.safeParse({
			...submission,
			correlation: null,
			state: "submission_unknown",
			admission: { state: "closed", barrierId: "barrier-1" },
		}).success,
	).toBe(true);
	const request = fixture("native-request");
	expect(contracts.NativeRequestV1Schema.safeParse({ ...request, engineEpoch: 2 }).success).toBe(false);
	expect(contracts.NativeRequestV1Schema.safeParse({ ...request, admissionReceipt: { state: "closed" } }).success).toBe(
		false,
	);
	expect(contracts.NativeRequestV1Schema.safeParse({ ...request, workspacePath: "/private/work" }).success).toBe(false);
	expect(
		contracts.NativeHandleV1Schema.safeParse({ ...fixture("native-handle"), workspaceId: "/private/work" }).success,
	).toBe(false);
});

test("nested iteration paths and condition phases retain distinct request bytes", () => {
	const request = fixture("native-request");
	const later = {
		...request,
		iterationPath: [
			{ loopNodeId: "outer", round: 3 },
			{ loopNodeId: "inner", round: 3 },
		],
	};
	expect(contracts.protocolDigest(JSON.stringify(later))).not.toBe(contracts.protocolDigest(JSON.stringify(request)));
	expect(contracts.protocolDigest(JSON.stringify({ ...request, phase: "condition" }))).not.toBe(
		contracts.protocolDigest(JSON.stringify(request)),
	);
	expect(
		contracts.NativeRequestV1Schema.safeParse({ ...request, iterationPath: [{ loopNodeId: "outer", round: 51 }] })
			.success,
	).toBe(false);
});

test("completion binds the original attempt, session, result bytes, and prompt receipt", () => {
	const completion = fixture("native-completion");
	for (const replacement of [
		{ attemptId: "00000000-0000-4000-8000-000000000099" },
		{ providerSessionId: "another-session" },
		{ promptReceiptId: "another-prompt" },
		{ requestDigest: "0".repeat(64) },
		{ launchBinding: { ...completion.result.launchBinding, engineEpoch: 2 } },
		{ output: "NO\n" },
	])
		expect(
			contracts.NativeCompletionV1Schema.safeParse({ ...completion, result: { ...completion.result, ...replacement } })
				.success,
		).toBe(false);
	expect(completion.provenance.requestDigest).toBe(contracts.protocolDigest(bytes("native-request")));
	expect(fixture("completion-delivery").resultDigest).toBe(contracts.protocolDigest(bytes("native-result")));
});

test("current authority can deliver old launch provenance only for the same job", () => {
	const delivery = fixture("completion-delivery");
	expect(delivery.authority.engineEpoch).toBe(2);
	expect(delivery.result.launchBinding.engineEpoch).toBe(1);
	expect(
		contracts.CompletionDeliveryV1Schema.safeParse({
			...delivery,
			authority: { ...delivery.authority, engineJobId: "00000000-0000-4000-8000-000000000099" },
		}).success,
	).toBe(false);
	const transfer = fixture("takeover");
	expect(
		contracts.TakeoverReceiptV1Schema.safeParse({
			...transfer,
			authority: { ...transfer.authority, ownershipRevision: 1 },
		}).success,
	).toBe(false);
	expect(
		contracts.TakeoverReceiptV1Schema.safeParse({
			...transfer,
			authority: { ...transfer.authority, ownerId: "owner-1" },
		}).success,
	).toBe(false);
	expect(
		contracts.DeliveryAuthorityV1Schema.safeParse({ ...transfer.authority, expiresAt: transfer.authority.issuedAt })
			.success,
	).toBe(false);
});

test("native and human waits cannot substitute for each other", () => {
	const checkpoint = fixture("checkpoint");
	expect(checkpoint.waits.map((wait) => wait.kind)).toEqual(["native", "human"]);
	expect(
		contracts.EngineCheckpointV1Schema.safeParse({ ...checkpoint, executionId: "another-execution" }).success,
	).toBe(false);
	expect(
		contracts.EngineCheckpointV1Schema.safeParse({ ...checkpoint, waits: [checkpoint.waits[0], checkpoint.waits[0]] })
			.success,
	).toBe(false);
	expect(contracts.ExternalWaitV1Schema.safeParse({ ...checkpoint.waits[0], kind: "human" }).success).toBe(false);
	expect(contracts.ExternalWaitV1Schema.safeParse({ ...checkpoint.waits[1], kind: "native" }).success).toBe(false);
	expect(
		contracts.HumanDecisionReceiptV1Schema.safeParse({
			...fixture("human-decision"),
			actor: { kind: "agent", name: "agent-1" },
		}).success,
	).toBe(false);
});

test("renewal preserves epoch and admission renewal matches the new owner", () => {
	const renewal = fixture("renewal");
	expect(
		contracts.RenewalReceiptV1Schema.safeParse({ ...renewal, authority: { ...renewal.authority, engineEpoch: 3 } })
			.success,
	).toBe(false);
	const transfer = fixture("takeover");
	expect(
		contracts.TakeoverReceiptV1Schema.safeParse({
			...transfer,
			admission: { state: "open", receipt: fixture("admission") },
		}).success,
	).toBe(false);
	const decision = fixture("decision-delivery");
	expect(
		contracts.DecisionDeliveryV1Schema.safeParse({
			...decision,
			authority: { ...decision.authority, permissions: ["native.read"] },
		}).success,
	).toBe(false);
	expect(
		contracts.DecisionDeliveryV1Schema.safeParse({
			...decision,
			authority: { ...decision.authority, engineJobId: "00000000-0000-4000-8000-000000000099" },
		}).success,
	).toBe(false);
});

test("human confirmation needs exact acceptance and cannot answer a later wait", () => {
	const delivery = fixture("human-delivery");
	if (delivery.state !== "confirmed") throw new Error("Expected confirmed fixture");
	expect(delivery.payloadDigest).toBe(contracts.protocolDigest(bytes("human-decision")));
	for (const replacement of [
		{ decisionId: "decision-2" },
		{ engineRequestId: "human-request-2" },
		{ payloadDigest: "0".repeat(64) },
	])
		expect(
			contracts.HumanDeliveryV1Schema.safeParse({ ...delivery, acceptance: { ...delivery.acceptance, ...replacement } })
				.success,
		).toBe(false);
	expect(contracts.HumanDeliveryV1Schema.safeParse({ ...delivery, acceptance: null }).success).toBe(false);
	expect(contracts.HumanDeliveryV1Schema.safeParse({ ...delivery, state: "unknown", acceptance: null }).success).toBe(
		true,
	);
	expect(contracts.DecisionLookupResultV1Schema.safeParse({ state: "accepted", status: 409 }).success).toBe(false);
});

test("reservation and receipt persistence do not start the group clock", () => {
	const launch = fixture("launch-receipt");
	const deadline = launch.groupDeadlines[0]!;
	expect(
		contracts.GroupDeadlineV1Schema.safeParse({
			...deadline,
			launchedAt: null,
			deadlineAt: null,
			launchReceiptId: null,
		}).success,
	).toBe(true);
	expect(
		contracts.GroupDeadlineV1Schema.safeParse({ ...deadline, launchedAt: fixture("launch-provenance").reservedAt })
			.success,
	).toBe(false);
	expect(contracts.GroupDeadlineV1Schema.safeParse({ ...deadline, launchedAt: launch.recordedAt }).success).toBe(false);
});

test("stop confirmation requires exact-attempt exit proof", () => {
	const stop = fixture("stop");
	if (stop.state !== "confirmed") throw new Error("Expected confirmed fixture");
	expect(contracts.StopObligationV1Schema.safeParse({ ...stop, exitReceipt: null }).success).toBe(false);
	expect(
		contracts.StopObligationV1Schema.safeParse({
			...stop,
			exitReceipt: { ...stop.exitReceipt, attemptId: "00000000-0000-4000-8000-000000000099" },
		}).success,
	).toBe(false);
	expect(
		contracts.StopObligationV1Schema.safeParse({ ...stop, state: "ownership_unknown", exitReceipt: null }).success,
	).toBe(true);
});

test("replay rejects missing sequences, wrong executions, tokens, and missing occurrences", () => {
	const replay = fixture("replay");
	if (replay.state !== "events") throw new Error("Expected events fixture");
	const event = fixture("event");
	expect(event.sourceDigest).toBe(contracts.protocolDigest(bytes("source-event")));
	expect(
		contracts.EventReplayV1Schema.safeParse({ ...replay, events: [{ ...event, seq: 2 }], nextSeq: 2 }).success,
	).toBe(false);
	expect(
		contracts.EventReplayV1Schema.safeParse({ ...replay, events: [{ ...event, executionId: "other-execution" }] })
			.success,
	).toBe(false);
	expect(contracts.ExecutionEventV1Schema.safeParse({ ...event, occurrence: null }).success).toBe(false);
	expect(
		contracts.ExecutionEventV1Schema.safeParse({ ...event, payload: { kind: "token", text: "secret" } }).success,
	).toBe(false);
	expect(contracts.FailureV1Schema.safeParse({ kind: "error", reason: "human_rejected" }).success).toBe(false);
	expect(contracts.FailureV1Schema.safeParse({ kind: "feedback", reason: "worker_lost" }).success).toBe(false);
});
