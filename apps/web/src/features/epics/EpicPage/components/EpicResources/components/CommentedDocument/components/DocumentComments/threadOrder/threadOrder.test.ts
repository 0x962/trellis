import { expect, test } from "bun:test";
import type { ResourceCommentThread } from "@trellis/api";
import { marginThreads, type ThreadPlace } from "./threadOrder";

const thread = (id: string, fields: Partial<ResourceCommentThread> = {}): ResourceCommentThread => ({
	id,
	resourceId: "doc",
	anchor: { quote: id, prefix: "", suffix: "" },
	textRemoved: false,
	resolved: null,
	comments: [],
	...fields,
});

const resolved = { actor: { name: "dana", kind: "human" as const }, at: "2026-09-21T10:00:00.000Z" };

test("orders threads by where their text sits now, and puts removed text last", () => {
	const places: Record<string, ThreadPlace> = { a: { from: 40 }, b: null, c: { from: 3 } };
	const rows = marginThreads([thread("a"), thread("b"), thread("c")], (id) => places[id], false);
	expect(rows.map((row) => [row.thread.id, row.textRemoved])).toEqual([
		["c", false],
		["a", false],
		["b", true],
	]);
});

test("reads the stored text removed flag until the editor tracks a thread", () => {
	const rows = marginThreads([thread("a", { textRemoved: true }), thread("b")], () => undefined, false);
	expect(rows.map((row) => [row.thread.id, row.textRemoved])).toEqual([
		["a", true],
		["b", false],
	]);
});

test("hides resolved threads unless the toggle shows them", () => {
	const threads = [thread("a"), thread("b", { resolved })];
	expect(marginThreads(threads, () => undefined, false).map((row) => row.thread.id)).toEqual(["a"]);
	expect(marginThreads(threads, () => undefined, true).map((row) => row.thread.id)).toEqual(["a", "b"]);
});
