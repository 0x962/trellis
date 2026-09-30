import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import {
	prepareBroadcast,
	prepareBroadcastRecipients,
} from "../../apps/server/src/services/agentRuns/broadcast/broadcast.ts";
import { prepareSend } from "../../apps/server/src/services/agentRuns/communication.ts";
import { readRuntimeSessionsRequired } from "../../apps/server/src/services/agentRuns/liveState.ts";
import { fixture } from "./fixture";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	f = await fixture();
}, 60_000);
afterEach(async () => {
	await f?.close();
});

test.each(["claude", "pi", "custom"])(
	"%s broadcasts wait for each working recipient and deduplicate replay",
	async (harness) => {
		for (const key of ["workingAgent", "workingFlow"] as const) {
			const path = join(f.home, "harness-attempts", f.terminals[key], "launch.json");
			const descriptor = JSON.parse(await readFile(path, "utf8"));
			await writeFile(path, JSON.stringify({ ...descriptor, harness }));
		}
		expect(await prepareBroadcastRecipients(f.ctx, {})).toEqual({ working: 2, idle: 1 });
		const input = { group: "working", text: "Keep the current task.", requestId: "boundary" } as const;
		expect(await prepareBroadcast(f.ctx, input)).toEqual({
			group: "working",
			recipientCount: 2,
			acceptedCount: 2,
			failures: [],
		});
		await prepareBroadcast(f.ctx, input);
		expect(await f.output("workingAgent")).toBe("");
		expect(await f.output("workingFlow")).toBe("");
		expect(await f.output("idleSession")).toBe("");
		await f.idle("workingAgent");
		await f.waitForOutput("workingAgent", input.text);
		const marker = harness === "custom" ? "" : `trellis-message:boundary-${f.ids.workingAgent}\n`;
		expect(await f.output("workingAgent")).toBe(
			`\u001b[200~${marker}This is a broadcast from the user.\n\n${input.text}\u001b[201~\r`,
		);
		expect(await f.output("workingFlow")).toBe("");
		await f.idle("workingFlow");
		await f.waitForOutput("workingFlow", input.text);
		expect((await f.output("workingFlow")).split(input.text)).toHaveLength(2);
	},
);

test("an idle recipient receives the complete original message", async () => {
	const text = "  First line\n\tSecond line 文\n\n";
	const result = await prepareBroadcast(f.ctx, { group: "idle", text, requestId: "exact" });
	expect(result).toEqual({ group: "idle", recipientCount: 1, acceptedCount: 1, failures: [] });
	await f.waitForOutput("idleSession", "Second line");
	expect(await f.output("idleSession")).toBe(
		`\u001b[200~trellis-message:exact-${f.ids.idleSession}\nThis is a broadcast from the user.\n\n${text}\u001b[201~\r`,
	);
});

test("a failed recipient keeps its identity and does not stop another delivery", async () => {
	await rm(join(f.home, "harness-attempts", f.terminals.workingFlow, "launch.json"));
	const result = await prepareBroadcast(f.ctx, { group: "working", text: "Partial delivery", requestId: "partial" });
	expect(result.recipientCount).toBe(2);
	expect(result.acceptedCount).toBe(1);
	expect(result.failures).toEqual([
		{
			recipient: {
				id: f.ids.workingFlow,
				name: "Working flow agent",
				kind: "flow",
				projectKey: "TWO",
				ticketIdentifier: "TWO-2",
			},
			reason: expect.stringContaining("ENOENT"),
		},
	]);
	await f.idle("workingAgent");
	await f.waitForOutput("workingAgent", "Partial delivery");
	expect(await f.output("workingFlow")).toBe("");
});

test("a changed recipient cannot receive a broadcast from an earlier selection", async () => {
	const result = await prepareBroadcast(
		f.ctx,
		{ group: "working", text: "Original target", requestId: "identity" },
		{
			read: async (home, input) => {
				const records = await readRuntimeSessionsRequired(home, input);
				await f.ctx.newTx((tx) =>
					tx.execute(sql`UPDATE agent_runs SET session_id='another-conversation' WHERE id=${f.ids.workingFlow}`),
				);
				return records;
			},
			send: prepareSend,
		},
	);
	expect(result.recipientCount).toBe(2);
	expect(result.acceptedCount).toBe(1);
	expect(result.failures[0]?.recipient.id).toBe(f.ids.workingFlow);
	expect(result.failures[0]?.reason).toContain("session changed");
	await f.idle("workingFlow");
	expect(await f.output("workingFlow")).toBe("");
});

test("a request cannot replace the bytes of a queued broadcast", async () => {
	const input = { group: "working", text: "Original message", requestId: "same-request" } as const;
	expect((await prepareBroadcast(f.ctx, input)).acceptedCount).toBe(2);
	const result = await prepareBroadcast(f.ctx, { ...input, text: "Changed message" });
	expect(result.acceptedCount).toBe(0);
	expect(result.failures).toHaveLength(2);
	for (const failure of result.failures) expect(failure.reason).toContain("different bytes");
	await f.idle("workingAgent");
	await f.waitForOutput("workingAgent", input.text);
	expect(await f.output("workingAgent")).not.toContain("Changed message");
});

test("a long request ID reaches the runtime and keeps replay deduplication", async () => {
	const input = { group: "working", text: "Long request identity", requestId: "request_".repeat(2_000) } as const;
	expect((await prepareBroadcast(f.ctx, input)).acceptedCount).toBe(2);
	expect((await prepareBroadcast(f.ctx, input)).acceptedCount).toBe(2);
	await f.idle("workingAgent");
	await f.waitForOutput("workingAgent", input.text);
	expect((await f.output("workingAgent")).split(input.text)).toHaveLength(2);
});
