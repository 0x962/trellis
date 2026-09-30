import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { IoCtx } from "../../support.ts";
import { prepareBroadcast, prepareBroadcastRecipients } from "./broadcast.ts";
import { broadcastFixture } from "./broadcastFixture.ts";

let fixture: Awaited<ReturnType<typeof broadcastFixture>>;

beforeAll(async () => {
	fixture = await broadcastFixture();
}, 30_000);

afterAll(async () => fixture.close());

beforeEach(async () => {
	fixture.resetProcesses();
	await fixture.setTicketCategory("todo");
});

test("counts working and idle agents across projects and epics", async () => {
	expect(await prepareBroadcastRecipients(fixture.ctx, {}, { read: fixture.read, send: async () => ({}) })).toEqual({
		working: 2,
		idle: 1,
	});
});

test.each(["todo", "started", "review"] as const)("includes idle agents on a %s ticket", async (category) => {
	await fixture.setTicketCategory(category);
	const calls: string[] = [];
	const result = await prepareBroadcast(
		fixture.ctx,
		{ group: "idle", text: "Continue the task", requestId: "unfinished-ticket" },
		{
			read: fixture.read,
			send: async (_ctx, input) => {
				calls.push(input.id);
			},
		},
	);
	expect(result).toEqual({ group: "idle", recipientCount: 1, acceptedCount: 1, failures: [] });
	expect(calls).toEqual([fixture.ids.idleAgent]);
});

test.each(["done", "canceled"] as const)("excludes idle agents after their ticket becomes %s", async (category) => {
	const calls: string[] = [];
	const deps = {
		read: fixture.read,
		send: async (_ctx: IoCtx, input: { id: string }) => {
			calls.push(input.id);
		},
	};
	expect(await prepareBroadcastRecipients(fixture.ctx, {}, deps)).toEqual({ working: 2, idle: 1 });
	await fixture.setTicketCategory(category);
	expect(await prepareBroadcastRecipients(fixture.ctx, {}, deps)).toEqual({ working: 2, idle: 0 });
	for (const group of ["idle", "both"] as const) {
		const result = await prepareBroadcast(fixture.ctx, { group, text: "Current work", requestId: category }, deps);
		expect(result.failures).toEqual([]);
		expect(result.recipientCount).toBe(group === "idle" ? 0 : 2);
	}
	expect(calls.sort()).toEqual([fixture.ids.workingAgent, fixture.ids.workingFlow].sort());
});

test("sends to both groups once and excludes idle sessions without a ticket", async () => {
	const calls: string[] = [];
	const result = await prepareBroadcast(
		fixture.ctx,
		{ group: "both", text: "Current work", requestId: "both-groups" },
		{
			read: fixture.read,
			send: async (_ctx, input) => {
				calls.push(input.id);
			},
		},
	);
	expect(result).toEqual({ group: "both", recipientCount: 3, acceptedCount: 3, failures: [] });
	expect(calls.sort()).toEqual([fixture.ids.workingAgent, fixture.ids.workingFlow, fixture.ids.idleAgent].sort());
});

test("refreshes the group before it sends and excludes stopped, failed, and archived agents", async () => {
	fixture.processes.set(
		fixture.terminals.workingAgent,
		fixture.processOf(fixture.terminals.workingAgent, { outcome: "completed" }),
	);
	const calls: Array<{
		id: string;
		text: string;
		messageId: string;
		atTurnBoundary: true;
		expectedTerminalId: string | null;
		expectedSessionId: string | null;
	}> = [];
	const result = await prepareBroadcast(
		fixture.ctx,
		{ group: "working", text: "Status check", requestId: "request-working" },
		{
			read: fixture.read,
			send: async (_ctx, input) => {
				calls.push(input);
				return { id: input.id };
			},
		},
	);

	expect(result).toEqual({ group: "working", recipientCount: 1, acceptedCount: 1, failures: [] });
	expect(calls).toEqual([
		{
			id: fixture.ids.workingFlow,
			text: "This is a broadcast from the user.\n\nStatus check",
			messageId: `request-working-${fixture.ids.workingFlow}`,
			expectedTerminalId: fixture.terminals.workingFlow,
			atTurnBoundary: true,
			expectedSessionId: `provider-${fixture.ids.workingFlow}`,
		},
	]);
});

test("reports partial failures and gives each recipient one stable delivery id", async () => {
	fixture.processes.set(
		fixture.terminals.workingAgent,
		fixture.processOf(fixture.terminals.workingAgent, { outcome: "completed" }),
	);
	const calls: Array<{ id: string; messageId: string }> = [];
	const send = async (_ctx: IoCtx, input: { id: string; messageId: string }) => {
		calls.push(input);
		if (input.id === fixture.ids.idleAgent) throw new Error("The execution service did not accept the message.");
		return { id: input.id };
	};
	const requestId = "request-idle_".repeat(2_000);
	const input = { group: "idle", text: "New direction", requestId } as const;
	const result = await prepareBroadcast(fixture.ctx, input, { read: fixture.read, send });

	expect(result.recipientCount).toBe(2);
	expect(result.acceptedCount).toBe(1);
	expect(result.failures).toEqual([
		{
			recipient: {
				id: fixture.ids.idleAgent,
				name: "Idle ticket agent",
				kind: "agent",
				projectKey: "TWO",
				ticketIdentifier: "TWO-2",
			},
			reason: "The execution service did not accept the message.",
		},
	]);
	expect(new Set(calls.map((call) => call.id)).size).toBe(2);
	expect(new Set(calls.map((call) => call.messageId)).size).toBe(2);
	for (const call of calls) expect(call.messageId.length).toBeLessThanOrEqual(128);

	const repeated: Array<{ id: string; messageId: string }> = [];
	await prepareBroadcast(fixture.ctx, input, {
		read: fixture.read,
		send: async (_ctx, delivery) => {
			repeated.push(delivery);
			return { id: delivery.id };
		},
	});
	expect(repeated.map((call) => call.messageId).sort()).toEqual(calls.map((call) => call.messageId).sort());
	const distinct: Array<{ id: string; messageId: string }> = [];
	const distinctResult = await prepareBroadcast(
		fixture.ctx,
		{ ...input, requestId: `${requestId}other` },
		{
			read: fixture.read,
			send: async (_ctx, delivery) => {
				distinct.push(delivery);
			},
		},
	);
	expect(distinctResult.failures).toEqual([]);
	for (const call of distinct) expect(calls.map((prior) => prior.messageId)).not.toContain(call.messageId);
});

test("sends nothing for an empty recipient group", async () => {
	fixture.processes.set(
		fixture.terminals.workingAgent,
		fixture.processOf(fixture.terminals.workingAgent, { outcome: "completed" }),
	);
	fixture.processes.set(
		fixture.terminals.workingFlow,
		fixture.processOf(fixture.terminals.workingFlow, { status: "unknown" }),
	);
	let calls = 0;
	const result = await prepareBroadcast(
		fixture.ctx,
		{ group: "working", text: "No recipients", requestId: "request-empty" },
		{
			read: fixture.read,
			send: async () => {
				calls += 1;
			},
		},
	);
	expect(result).toEqual({ group: "working", recipientCount: 0, acceptedCount: 0, failures: [] });
	expect(calls).toBe(0);
});
