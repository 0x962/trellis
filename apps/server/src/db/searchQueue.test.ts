import { expect, test } from "bun:test";
import { systemContext } from "../context.ts";
import { ServiceQueue } from "./worker.ts";
import type { WorkerCall } from "./workerProtocol.ts";

test("a newer search replaces its queued predecessor and leaves other work available", () => {
	const queue = new ServiceQueue();
	const first: WorkerCall = {
		type: "call",
		id: 1,
		kind: "search",
		clientId: "search-client",
		name: "search.query",
		ctx: systemContext(),
		input: { q: "first" },
		ghStatus: { ok: true, user: null, reason: null, message: null, checkedAt: null },
	};
	const newer = { ...first, id: 2, input: { q: "newer" } };
	const otherClient = { ...first, id: 3, clientId: "other-client" };
	const mutation: WorkerCall = { ...first, id: 4, kind: "mutation", name: "tickets.update", input: {} };

	expect(queue.push(first)).toBeUndefined();
	expect(queue.push(otherClient)).toBeUndefined();
	expect(queue.push(newer)).toBe(first);
	expect(queue.push(mutation)).toBeUndefined();
	expect(queue.shift()).toBe(mutation);
	expect(queue.shift()).toBe(otherClient);
	expect(queue.shift()).toBe(newer);
	expect(queue.size).toBe(0);
});
