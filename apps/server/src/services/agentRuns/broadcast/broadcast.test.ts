import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { IoCtx } from "../../support.ts";
import { prepareBroadcast, prepareBroadcastRecipients } from "./broadcast.ts";
import { broadcastFixture } from "./broadcastFixture.ts";

let fixture: Awaited<ReturnType<typeof broadcastFixture>>;

beforeAll(async () => {
	fixture = await broadcastFixture();
}, 30_000);

afterAll(async () => fixture.close());

beforeEach(() => fixture.resetProcesses());

test("counts working and idle agents across projects and epics", async () => {
	expect(await prepareBroadcastRecipients(fixture.ctx, {}, { read: fixture.read, send: async () => ({}) })).toEqual({
		working: 2,
		idle: 2,
	});
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
			text: "Status check",
			messageId: `request-working-${fixture.ids.workingFlow}`,
			expectedTerminalId: fixture.terminals.workingFlow,
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
	const input = { group: "idle", text: "New direction", requestId: "request-idle" } as const;
	const result = await prepareBroadcast(fixture.ctx, input, { read: fixture.read, send });

	expect(result.recipientCount).toBe(3);
	expect(result.acceptedCount).toBe(2);
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
	expect(new Set(calls.map((call) => call.id)).size).toBe(3);
	expect(calls.map((call) => call.messageId).sort()).toEqual(calls.map((call) => `request-idle-${call.id}`).sort());

	const repeated: Array<{ id: string; messageId: string }> = [];
	await prepareBroadcast(fixture.ctx, input, {
		read: fixture.read,
		send: async (_ctx, delivery) => {
			repeated.push(delivery);
			return { id: delivery.id };
		},
	});
	expect(repeated.map((call) => call.messageId).sort()).toEqual(calls.map((call) => call.messageId).sort());
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
