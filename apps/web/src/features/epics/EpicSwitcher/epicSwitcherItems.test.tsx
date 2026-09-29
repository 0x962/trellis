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
	epic("empty", "Empty epic", "open", counts(0, 0)),
	epic("onboarding", "Onboarding", "done", counts(5, 5)),
];

const iconLabel = (item: ReturnType<typeof epicSwitcherItems>[number]) =>
	renderToStaticMarkup(item.icon!).match(/aria-label="([^"]+)"/)?.[1];

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

	test("draws the progress circle of each epic, without the canceled tickets", () => {
		const items = epicSwitcherItems(epics, "OP/runtime");
		expect(items.slice(0, 3).map(iconLabel)).toEqual(["3 of 10 done", "0 of 4 done", "0 of 0 done"]);
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
