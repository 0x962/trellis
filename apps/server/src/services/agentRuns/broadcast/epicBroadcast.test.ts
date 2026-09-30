import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { prepareBroadcast, prepareBroadcastRecipients } from "./broadcast.ts";
import { broadcastFixture } from "./broadcastFixture.ts";

let fixture: Awaited<ReturnType<typeof broadcastFixture>>;
beforeAll(async () => {
	fixture = await broadcastFixture();
}, 30_000);
afterAll(async () => fixture.close());

test("counts only ticket and flow agents in the selected epic by reference or ID", async () => {
	const deps = { read: fixture.read, send: async () => ({}) };
	expect(await prepareBroadcastRecipients(fixture.ctx, { epic: "ONE/first-plan" }, deps)).toEqual({
		working: 1,
		idle: 0,
	});
	expect(await prepareBroadcastRecipients(fixture.ctx, { epic: fixture.epics.activeB }, deps)).toEqual({
		working: 1,
		idle: 1,
	});
});

test.each(["working", "idle", "both"] as const)("delivers to the %s group only within the epic", async (group) => {
	const calls: string[] = [];
	const result = await prepareBroadcast(
		fixture.ctx,
		{ epic: "TWO/second-plan", group, text: "Epic direction", requestId: `epic-${group}` },
		{
			read: fixture.read,
			send: async (_ctx, input) => {
				calls.push(input.id);
			},
		},
	);
	const recipients =
		group === "both"
			? [fixture.ids.workingFlow, fixture.ids.idleAgent]
			: [group === "working" ? fixture.ids.workingFlow : fixture.ids.idleAgent];
	expect(result).toEqual({ group, recipientCount: recipients.length, acceptedCount: recipients.length, failures: [] });
	expect(calls.sort()).toEqual(recipients.sort());
});

test("an empty epic excludes agents from another epic in the same project", async () => {
	const deps = {
		read: async () => {
			throw new Error("An empty selection must not contact the runtime.");
		},
		send: async () => {
			throw new Error("An empty selection must not send a message.");
		},
	};
	expect(await prepareBroadcastRecipients(fixture.ctx, { epic: "ONE/empty-plan" }, deps)).toEqual({
		working: 0,
		idle: 0,
	});
	expect(
		await prepareBroadcast(
			fixture.ctx,
			{ epic: "ONE/empty-plan", group: "working", text: "Empty", requestId: "empty-epic" },
			deps,
		),
	).toEqual({ group: "working", recipientCount: 0, acceptedCount: 0, failures: [] });
});

test("a missing epic fails before runtime access or delivery", async () => {
	let calls = 0;
	const deps = {
		read: async () => {
			calls++;
			return [];
		},
		send: async () => {
			calls++;
		},
	};
	await expect(prepareBroadcastRecipients(fixture.ctx, { epic: "ONE/missing" }, deps)).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	await expect(
		prepareBroadcast(
			fixture.ctx,
			{ epic: "ONE/missing", group: "working", text: "Missing", requestId: "missing-epic" },
			deps,
		),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(calls).toBe(0);
});

test("delivery reads current epic membership after the preview", async () => {
	const calls: string[] = [];
	const deps = {
		read: fixture.read,
		send: async (_ctx: unknown, input: { id: string }) => {
			calls.push(input.id);
		},
	};
	expect((await prepareBroadcastRecipients(fixture.ctx, { epic: "ONE/first-plan" }, deps)).working).toBe(1);
	await fixture.ctx.newTx((tx) =>
		tx.execute(sql`UPDATE tickets SET epic_id=${fixture.epics.emptyA} WHERE id=${fixture.tickets.activeA}`),
	);
	try {
		const result = await prepareBroadcast(
			fixture.ctx,
			{ epic: "ONE/first-plan", group: "working", text: "Moved ticket", requestId: "moved-ticket" },
			deps,
		);
		expect(result.recipientCount).toBe(0);
		expect(calls).toEqual([]);
	} finally {
		await fixture.ctx.newTx((tx) =>
			tx.execute(sql`UPDATE tickets SET epic_id=${fixture.epics.activeA} WHERE id=${fixture.tickets.activeA}`),
		);
	}
});
