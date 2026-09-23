import { describe, expect, test } from "bun:test";
import type { StatusCategory } from "@trellis/api";
import { doneStarts, type WashRow } from "./doneStarts";

const row = (id: string, category: StatusCategory, group = "wave-1"): WashRow => ({ id, group, category });

// The call of a page that draws no full circle yet and whose server counts
// call no wave done.
const starts = (seen: ReadonlyMap<string, boolean>, rows: readonly WashRow[]) => doneStarts(seen, rows, [], new Set());

describe("doneStarts", () => {
	test("plays nothing for a ticket that is already done when the page opens", () => {
		const first = starts(new Map(), [row("a", "done")]);

		expect(first.started).toEqual([]);
		expect(first.next.get("a")).toBe(true);
	});

	test("plays once when the status turns done, and not again on the next poll", () => {
		const first = starts(new Map(), [row("a", "todo")]);
		expect(first.started).toEqual([]);

		const second = starts(first.next, [row("a", "done")]);
		expect(second.started).toEqual(["a"]);

		const third = starts(second.next, [row("a", "done")]);
		expect(third.started).toEqual([]);
	});

	test("plays nothing for a done ticket that a filter or a sort brings into the list", () => {
		const first = starts(new Map(), [row("a", "done"), row("b", "todo")]);
		const filtered = starts(first.next, [row("b", "todo")]);
		const back = starts(filtered.next, [row("a", "done"), row("b", "todo")]);

		expect(back.started).toEqual([]);
	});

	test("holds the play state by ticket id, so the order of the rows moves nothing", () => {
		const first = starts(new Map(), [row("a", "todo"), row("b", "todo"), row("c", "todo")]);
		const scrolled = starts(first.next, [row("c", "todo"), row("b", "done"), row("a", "todo")]);

		expect(scrolled.started).toEqual(["b"]);

		const again = starts(scrolled.next, [row("a", "todo"), row("b", "done"), row("c", "todo")]);
		expect(again.started).toEqual([]);
	});

	test("names every ticket that turned done in the same poll", () => {
		const before = new Map([
			["a", false],
			["b", false],
			["c", true],
		]);
		const now = starts(before, [row("a", "done"), row("b", "done"), row("c", "done")]);

		expect(now.started).toEqual(["a", "b"]);
	});

	test("names the wave of the last ticket that its group keeps open", () => {
		const before = new Map([
			["a", true],
			["b", false],
		]);
		const now = starts(before, [row("a", "done"), row("b", "done")]);

		expect(now.waves).toEqual(["wave-1"]);
	});

	test("names the wave once when two of its tickets turn done together", () => {
		const before = new Map([
			["a", false],
			["b", false],
		]);
		const now = starts(before, [row("a", "done"), row("b", "done")]);

		expect(now.waves).toEqual(["wave-1"]);
	});

	test("counts a canceled ticket as closed, so it holds no wave open", () => {
		const before = new Map([
			["a", false],
			["b", false],
		]);
		const now = starts(before, [row("a", "done"), row("b", "canceled")]);

		expect(now.started).toEqual(["a"]);
		expect(now.waves).toEqual(["wave-1"]);
	});

	test("names no wave while the wave still holds an open ticket", () => {
		const before = new Map([["a", false]]);
		const now = starts(before, [row("a", "done"), row("b", "todo")]);

		expect(now.started).toEqual(["a"]);
		expect(now.waves).toEqual([]);
	});

	test("reads each group on its own, so an open ticket of another wave names nothing", () => {
		const before = new Map([["a", false]]);
		const now = starts(before, [row("a", "done", "wave-1"), row("b", "todo", "wave-2")]);

		expect(now.waves).toEqual(["wave-1"]);
	});

	test("plays again when a ticket is reopened and closed a second time", () => {
		const closedOnce = starts(new Map([["a", false]]), [row("a", "done")]);
		expect(closedOnce.started).toEqual(["a"]);

		const reopened = starts(closedOnce.next, [row("a", "todo")]);
		expect(reopened.started).toEqual([]);

		const closedAgain = starts(reopened.next, [row("a", "done")]);
		expect(closedAgain.started).toEqual(["a"]);
	});
});

describe("the full circle of a wave", () => {
	test("holds while the counts of the wave have not arrived", () => {
		const now = doneStarts(new Map([["a", false]]), [row("a", "done")], [], new Set());
		expect(now.waves).toEqual(["wave-1"]);

		const later = doneStarts(now.next, [row("a", "done")], now.waves, new Set());
		expect(later.waves).toEqual(["wave-1"]);
	});

	test("ends when the counts of the wave call it done", () => {
		const now = doneStarts(new Map([["a", false]]), [row("a", "done")], [], new Set());
		const counted = doneStarts(now.next, [row("a", "done")], now.waves, new Set(["wave-1"]));

		expect(counted.waves).toEqual([]);
	});

	test("ends when a row of the wave opens again", () => {
		const now = doneStarts(new Map([["a", false]]), [row("a", "done")], [], new Set());
		const reopened = doneStarts(now.next, [row("a", "todo")], now.waves, new Set());

		expect(reopened.waves).toEqual([]);
	});

	test("draws no full circle for a wave the counts already call done", () => {
		const now = doneStarts(new Map([["a", false]]), [row("a", "done")], [], new Set(["wave-1"]));

		expect(now.started).toEqual(["a"]);
		expect(now.waves).toEqual([]);
	});
});
