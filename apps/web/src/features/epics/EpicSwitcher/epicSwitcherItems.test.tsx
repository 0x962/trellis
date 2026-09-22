import { describe, expect, test } from "bun:test";
import type { EpicCounts, EpicSummary } from "@trellis/api";
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
	epic("onboarding", "Onboarding", "done", counts(5, 5)),
];

const iconLabel = (item: ReturnType<typeof epicSwitcherItems>[number]) =>
	renderToStaticMarkup(item.icon!).match(/aria-label="([^"]+)"/)?.[1];

describe("epicSwitcherItems", () => {
	test("lists every epic in list order, then the All epics row", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.map((item) => item.id)).toEqual(["OP/dashboards", "OP/runtime", "OP/onboarding", allEpicsId]);
		expect(items.map((item) => item.label)).toEqual([
			"Make Operator dashboards real",
			"Routine runtime",
			"Onboarding",
			"All epics",
		]);
	});

	test("marks the open epic as current, and no other row", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.map((item) => item.current === true)).toEqual([false, true, false, false]);
	});

	test("draws the progress circle of each epic, without the canceled tickets", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.slice(0, 3).map(iconLabel)).toEqual(["3 of 10 done", "0 of 4 done", "5 of 5 done"]);
	});

	test("keeps the Done hint of a done epic", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.map((item) => item.hint)).toEqual([undefined, undefined, "Done", undefined]);
	});
});

describe("epicSwitchSearch", () => {
	test("keeps the Resources tab, and opens Overview with an empty search", () => {
		expect(epicSwitchSearch("resources")).toEqual({ tab: "resources" });
		expect(epicSwitchSearch("overview")).toEqual({});
	});
});
