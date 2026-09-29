import { expect, test } from "bun:test";
import { createTrellisClient } from "../client.ts";
import { FlowAttemptOutputV1InputSchema, FlowRecoveryV1Schema } from "../schemas/flowExecutionActionsV1.ts";
import { executionViewV1Example, flowV1FixtureIds, flowV1RequestId } from "../schemas/flowV1Fixtures.ts";
import { flowExecutionsV1 } from "./flowExecutionsV1.ts";

test("action clients retain actor headers, request identity, and versioned responses", async () => {
	const requests: { path: string; body: unknown }[] = [];
	const client = createTrellisClient("http://localhost", "human:reviewer", async (request) => {
		expect(request.headers.get("x-trellis-actor")).toBe("human:reviewer");
		requests.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json({ json: executionViewV1Example });
	});
	const start = { flow: "review", ticket: "TRL-1", expectedVersion: 1, requestId: flowV1RequestId };
	expect(await client.flowExecutionsV1.start(start)).toEqual(executionViewV1Example);
	expect(requests[0]).toEqual({ path: "/rpc/flowExecutionsV1/start", body: { json: start } });
	const decision = {
		id: flowV1FixtureIds.execution,
		actionKey: "round:37",
		expectedRevision: 1,
		approved: true,
		output: "accepted",
	};
	await client.flowExecutionsV1.decision(decision);
	await client.flowExecutionsV1.cancel({ id: flowV1FixtureIds.execution, expectedRevision: 1 });
	expect(requests.map((value) => value.path)).toEqual([
		"/rpc/flowExecutionsV1/start",
		"/rpc/flowExecutionsV1/decision",
		"/rpc/flowExecutionsV1/cancel",
	]);
	expect(requests[1]!.body).toEqual({ json: decision });
	expect(flowExecutionsV1.decision["~orpc"].errorMap).toHaveProperty("FLOW_VERSION_CONFLICT");
});

test("recovery distinguishes unavailable control from a known generation", () => {
	expect(FlowRecoveryV1Schema.parse({ state: "unavailable", generation: null }).state).toBe("unavailable");
	expect(FlowRecoveryV1Schema.parse({ state: "blocked", generation: 2 }).generation).toBe(2);
	expect(FlowRecoveryV1Schema.safeParse({ state: "open", generation: null }).success).toBe(false);
});

test("retained output requires every exact binding and preserves unavailable text", async () => {
	const input = {
		executionId: flowV1FixtureIds.execution,
		stepId: "step:37",
		agentRunId: flowV1FixtureIds.execution,
		attemptId: "attempt:37",
		resultId: "result:37",
	};
	for (const field of Object.keys(input))
		expect(FlowAttemptOutputV1InputSchema.safeParse({ ...input, [field]: null }).success).toBe(false);
	const client = createTrellisClient("http://localhost", "human:reviewer", async (request) => {
		expect(await request.json()).toEqual({ json: input });
		return Response.json({ json: { ...input, output: null } });
	});
	expect(await client.flowExecutionsV1.output(input)).toEqual({ ...input, output: null });
});
