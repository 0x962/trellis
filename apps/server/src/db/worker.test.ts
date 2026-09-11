import { describe, expect, test } from "bun:test";
import { ServiceQueue, type WorkerCall } from "./worker.ts";

const call = (id: number, kind: WorkerCall["kind"], clientId?: string): WorkerCall => ({
	type: "call",
	id,
	kind,
	clientId,
	name: kind === "search" ? "search.query" : "tickets.list",
	ctx: {
		actor: null,
		session: clientId ?? null,
		reqId: `request-${id}`,
		now: new Date("2026-09-10T12:00:00.000Z"),
	},
	input: {},
	ghStatus: { ok: true, user: "dana", reason: null, message: null, checkedAt: "2026-09-10T12:00:00.000Z" },
});

describe("ServiceQueue", () => {
	test("a mutation queued behind ten reads runs first", () => {
		const queue = new ServiceQueue();
		for (let id = 1; id <= 10; id += 1) queue.push(call(id, "read"));
		queue.push(call(11, "mutation"));

		const order: number[] = [];
		while (queue.size > 0) order.push(queue.shift()!.id);

		expect(order).toEqual([11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	test("a newer search removes the queued search from the same client", () => {
		const queue = new ServiceQueue();
		queue.push(call(1, "search", "web-tab"));
		const dropped = queue.push(call(2, "search", "web-tab"));

		const ran: number[] = [];
		while (queue.size > 0) ran.push(queue.shift()!.id);

		expect(dropped?.id).toBe(1);
		expect(ran).toEqual([2]);
	});
});
