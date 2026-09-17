import { describe, expect, test } from "bun:test";
import type { Comment, TimelineItem } from "@trellis/api";
import { groupThreads } from "./groupThreads";

// A comment row as the server writes it into the timeline.
const comment = (id: string, parentId: string | null = null): TimelineItem =>
	({
		kind: "comment",
		id,
		ticketId: "01J9ZK3Q8V2M4N6P7R8S9T0V1Z",
		parentId,
		body: `body of ${id}`,
		resolvedAt: null,
		actor: { kind: "human", name: "dana" },
		createdAt: "2026-09-09T12:00:00.000Z",
		updatedAt: "2026-09-09T12:00:00.000Z",
	}) as unknown as TimelineItem;

// An activity row. `groupThreads` reads comments only.
const activity = (id: number): TimelineItem =>
	({
		kind: "activity",
		id,
		actor: { kind: "human", name: "dana" },
		action: "ticket.updated",
		field: null,
		fromValue: null,
		toValue: null,
		meta: {},
		createdAt: "2026-09-09T12:00:00.000Z",
	}) as unknown as TimelineItem;

const bodies = (threads: Map<string, Comment[]>, key: string) => threads.get(key)?.map((row) => row.id);

describe("groupThreads", () => {
	test("keys a root comment by its own id", () => {
		const threads = groupThreads([comment("a"), comment("b")]);
		expect([...threads.keys()]).toEqual(["a", "b"]);
	});

	test("puts a reply under the id of its root", () => {
		const threads = groupThreads([comment("a"), comment("a1", "a"), comment("a2", "a")]);
		expect([...threads.keys()]).toEqual(["a"]);
		expect(bodies(threads, "a")).toEqual(["a", "a1", "a2"]);
	});

	test("keeps the order the page gives, oldest first", () => {
		const threads = groupThreads([comment("a"), comment("b"), comment("a1", "a")]);
		expect([...threads.keys()]).toEqual(["a", "b"]);
		expect(bodies(threads, "a")).toEqual(["a", "a1"]);
	});

	test("reads no activity row", () => {
		const threads = groupThreads([activity(1), comment("a"), activity(2)]);
		expect([...threads.keys()]).toEqual(["a"]);
	});

	// The ticket page draws the mentioned thread in its own section above, so
	// the comments section leaves out the root and every reply of it.
	test("leaves out the mentioned thread", () => {
		const threads = groupThreads([comment("a"), comment("a1", "a"), comment("b")], "a");
		expect([...threads.keys()]).toEqual(["b"]);
	});

	test("keeps every thread when no comment is mentioned", () => {
		const threads = groupThreads([comment("a"), comment("b")], undefined);
		expect([...threads.keys()]).toEqual(["a", "b"]);
	});

	test("gives an empty map for a page with no comment", () => {
		expect(groupThreads([activity(1)]).size).toBe(0);
	});
});
