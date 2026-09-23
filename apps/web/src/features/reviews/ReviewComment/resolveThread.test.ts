import { expect, test } from "bun:test";
import type { ReviewThread } from "@trellis/api";
import { resolveThread, type ThreadList, type ThreadListStore } from "./resolveThread";

const thread = (id: string, status: "open" | "resolved"): ReviewThread => ({
	id,
	prId: "01M369RQJ79923V1SHD70H3RDG",
	path: "backend/briefing.py",
	side: "new",
	line: 52,
	startLine: 52,
	revisionId: null,
	author: "backend-checks",
	kind: "agent",
	session: null,
	body: "This call has no timeout.",
	createdAt: "2026-09-23T00:19:19.318Z",
	updatedAt: "2026-09-23T00:19:19.318Z",
	version: 1,
	reactions: [],
	replies: [],
	status,
	resolvedBy: status === "resolved" ? "navid" : null,
	resolvedAt: status === "resolved" ? "2026-09-23T00:20:00.000Z" : null,
});

const listOf = (...items: ReviewThread[]): ThreadList => ({
	items,
	total: items.length,
	open: items.filter((item) => item.status === "open").length,
});

// A store over one variable, plus the log of what the card wrote and when it
// asked for a refetch.
const storeOf = (list: ThreadList) => {
	const writes: ThreadList[] = [];
	let refetches = 0;
	let current = list;
	const store: ThreadListStore = {
		read: () => current,
		write: (next) => {
			current = next;
			writes.push(next);
		},
		refetch: async () => {
			refetches += 1;
		},
	};
	return {
		store,
		writes,
		current: () => current,
		refetches: () => refetches,
	};
};

const change = { id: "t1", resolved: true, by: "navid", at: "2026-09-23T07:00:00.000Z" };

test("the list takes the new status before the call answers", async () => {
	const held = storeOf(listOf(thread("t1", "open"), thread("t2", "open")));
	let release = () => {};
	const call = resolveThread(held.store, () => new Promise<void>((resolve) => (release = resolve)), change);

	expect(held.current().items[0]!.status).toBe("resolved");
	expect(held.current().items[0]!.resolvedBy).toBe("navid");
	expect(held.current().items[0]!.resolvedAt).toBe("2026-09-23T07:00:00.000Z");
	expect(held.current().items[1]!.status).toBe("open");
	expect(held.current().open).toBe(1);
	expect(held.refetches()).toBe(0);

	release();
	await call;
	expect(held.refetches()).toBe(1);
});

test("a failed resolve puts the list back and throws the reason", async () => {
	const before = listOf(thread("t1", "open"));
	const held = storeOf(before);

	const call = resolveThread(
		held.store,
		async () => {
			throw new Error("The thread belongs to another pull request.");
		},
		change,
	);

	expect(call).rejects.toThrow("The thread belongs to another pull request.");
	await call.catch(() => {});
	expect(held.current()).toBe(before);
	expect(held.current().items[0]!.status).toBe("open");
	expect(held.current().open).toBe(1);
	expect(held.refetches()).toBe(0);
});

test("a reopen clears the resolver and counts the thread as open again", async () => {
	const held = storeOf(listOf(thread("t1", "resolved")));

	await resolveThread(held.store, async () => {}, { ...change, resolved: false });

	expect(held.current().items[0]!.status).toBe("open");
	expect(held.current().items[0]!.resolvedBy).toBeNull();
	expect(held.current().items[0]!.resolvedAt).toBeNull();
	expect(held.current().open).toBe(1);
});
