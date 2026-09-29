import { expect, test } from "bun:test";
import { AgentBroadcastInputSchema } from "../../schemas/agentBroadcast.ts";
import { AgentRunRetryInputSchema, AgentRunStartInputSchema } from "../../schemas/agentRun.ts";
import { PagePublishInputSchema, PageRenderRenewInputSchema } from "../../schemas/pageVersion.ts";
import { agentRuns } from "../agentRuns.ts";

const id = "01M2PT14NJDS107B4TGK6PNFDA";
const longKey = "request_".repeat(2_000);
const common = { id, expectedTerminalId: "attempt", requestId: longKey };

test("agent action contracts preserve long request keys", () => {
	expect(
		AgentRunStartInputSchema.parse({ ticket: "TRL-1", harness: { preset: "codex" }, requestId: longKey }).requestId,
	).toBe(longKey);
	expect(AgentRunRetryInputSchema.parse(common).requestId).toBe(longKey);
	expect(agentRuns.resume["~orpc"].inputSchema!.parse(common).requestId).toBe(longKey);
	expect(agentRuns.switchAccount["~orpc"].inputSchema!.parse({ ...common, accountId: id }).requestId).toBe(longKey);
	expect(agentRuns.setModel["~orpc"].inputSchema!.parse({ ...common, model: "openai/gpt-6-astra" }).requestId).toBe(
		longKey,
	);
});

test("broadcast and Page lease contracts preserve long keys", () => {
	expect(AgentBroadcastInputSchema.parse({ group: "working", text: "Read", requestId: longKey }).requestId).toBe(
		longKey,
	);
	expect(PageRenderRenewInputSchema.parse({ leaseId: longKey }).leaseId).toBe(longKey);
});

test("request keys retain their required characters and nonempty values", () => {
	for (const requestId of ["", "has space", "has\nnewline", "界"]) {
		expect(
			AgentRunStartInputSchema.safeParse({ ticket: "TRL-1", harness: { preset: "codex" }, requestId }).success,
		).toBe(false);
		expect(AgentBroadcastInputSchema.safeParse({ group: "working", text: "Read", requestId }).success).toBe(false);
	}
	for (const schema of [AgentRunRetryInputSchema, agentRuns.resume["~orpc"].inputSchema!]) {
		expect(schema.safeParse({ ...common, requestId: "" }).success).toBe(false);
	}
	expect(PageRenderRenewInputSchema.safeParse({ leaseId: "" }).success).toBe(false);
});

test("Page publication still requires an exact UUID", () => {
	const input = { project: "TRL", title: "Page", document: id, sourcePath: "index.html" };
	const requestId = "123e4567-e89b-42d3-a456-426614174000";
	expect(PagePublishInputSchema.parse({ ...input, requestId }).requestId).toBe(requestId);
	for (const invalid of [longKey, `${requestId}a`, requestId.slice(1)]) {
		expect(PagePublishInputSchema.safeParse({ ...input, requestId: invalid }).success).toBe(false);
	}
});
