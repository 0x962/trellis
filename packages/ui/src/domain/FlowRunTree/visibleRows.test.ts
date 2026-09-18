import { expect, test } from "bun:test";
import type { FlowRunRow } from "./types";
import { visibleRows } from "./visibleRows";

const row = (key: string, parentKey: string | null, hasChildren = false): FlowRunRow => ({
	key,
	parentKey,
	depth: 0,
	kind: hasChildren ? "group" : "agent",
	title: key,
	state: "pending",
	meta: null,
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	output: null,
	error: null,
	terminal: false,
	decidable: false,
	hasChildren,
});

const rows = [row("a", null, true), row("a/b", "a", true), row("a/b/c", "a/b"), row("a/d", "a"), row("e", null)];

test("shows every row when nothing is collapsed", () => {
	expect(visibleRows(rows, new Set()).map((item) => item.key)).toEqual(["a", "a/b", "a/b/c", "a/d", "e"]);
});

test("hides every descendant of a collapsed row", () => {
	expect(visibleRows(rows, new Set(["a"])).map((item) => item.key)).toEqual(["a", "e"]);
});

test("keeps the siblings of a collapsed row", () => {
	expect(visibleRows(rows, new Set(["a/b"])).map((item) => item.key)).toEqual(["a", "a/b", "a/d", "e"]);
});
