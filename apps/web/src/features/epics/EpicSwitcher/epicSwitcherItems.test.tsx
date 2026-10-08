import { describe, expect, test } from "bun:test";
import type { EpicCounts, EpicSummary } from "@trellis/api";
import { Command } from "@trellis/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { allEpicsId, epicSwitcherItems, epicSwitchSearch } from "./epicSwitcherItems";

const counts = (done: number, total: number, canceled = 0): EpicCounts => ({
	total,
	todo: total - done - canceled,
	started: 0,
	review: 0,
	done,
	canceled,
});

const epic = (slug: string, name: string, state: EpicSummary["state"], epicCounts: EpicCounts) =>
	({ ref: `OP/${slug}`, slug, name, state, counts: epicCounts }) as EpicSummary;

const epics = [
	epic("dashboards", "Make Operator dashboards real", "open", counts(3, 12, 2)),
	epic("runtime", "Routine runtime", "open", counts(0, 4)),
	epic("empty", "Empty epic", "open", counts(0, 0)),
	epic("onboarding", "Onboarding", "done", counts(5, 5)),
];

describe("epicSwitcherItems", () => {
	test("lists incomplete and empty epics in list order, then the All epics row", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.map((item) => item.id)).toEqual(["OP/dashboards", "OP/runtime", "OP/empty", allEpicsId]);
		expect(items.map((item) => item.label)).toEqual([
			"Make Operator dashboards real",
			"Routine runtime",
			"Empty epic",
			"All epics",
		]);
	});

	test("marks the open epic as current, and no other row", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.map((item) => item.current === true)).toEqual([false, true, false, false]);
	});

	test("prints the progress of each open epic", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.slice(0, 3).map((item) => item.hint)).toEqual(["3/10 done", "0/4 done", "0/0 done"]);
	});

	test("puts progress in the option name without a nested focus target", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		const html = renderToStaticMarkup(<Command label="Search epics" items={items} onSelect={() => {}} />);
		expect(html).toContain('<span class="sr-only">, 3 of 10 tickets done</span>');
		expect(html).not.toContain('aria-label="Make Operator dashboards real"');
		expect(html).not.toContain('tabindex="0"');
		expect(items.slice(0, 3).every((item) => item.icon === undefined)).toBe(true);
	});

	test("does not create a search item for a completed epic", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.some((item) => item.label === "Onboarding" || item.keywords?.includes("onboarding"))).toBe(false);
	});

	test("omits a completed current epic from the choices", () => {
		const items = epicSwitcherItems(epics, "OP/onboarding");
		expect(items.some((item) => item.id === "OP/onboarding")).toBe(false);
		expect(items.some((item) => item.current === true)).toBe(false);
	});

	test("keeps the All epics row when no incomplete epic exists", () => {
		expect(epicSwitcherItems([epics[3]!], "OP/onboarding").map((item) => item.id)).toEqual([allEpicsId]);
	});
});

describe("epicSwitchSearch", () => {
	test("keeps the Resources tab, and opens Overview with an empty search", () => {
		expect(epicSwitchSearch("resources")).toEqual({ tab: "resources" });
		expect(epicSwitchSearch("overview")).toEqual({});
	});
});
