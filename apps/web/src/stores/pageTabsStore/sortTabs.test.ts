import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore, pageTabRegion } from "./pageTabsStore";
import { sortTabs, visibleTabName } from "./sortTabs";

const fixture = () => {
	const entries = new Map<string, string>();
	const storage: StateStorage = {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, value);
		},
		removeItem: (key) => {
			entries.delete(key);
		},
	};
	let id = 0;
	const open = (origin = "http://host-a") =>
		createPageTabsStore({
			origin,
			storage,
			createId: () => `tab-${++id}`,
			initialPage: { url: "/needs-you", title: "Needs you" },
			homePage: { url: "/needs-you", title: "Needs you" },
		});
	return { open, entries };
};

const named = (id: string, title: string, customTitle?: string) => ({ id, title, customTitle });
const oneRegion = () => "";

test("the visible name is the custom name, else the page title", () => {
	expect(visibleTabName(named("a", "Usage"))).toBe("Usage");
	expect(visibleTabName(named("a", "Usage", "Costs"))).toBe("Costs");
});

test("sorts by visible name in both directions with a natural order", () => {
	const tabs = [named("a", "Ticket 10"), named("b", "ticket 9"), named("c", "Épic"), named("d", "Agents", "Zebra")];
	expect(sortTabs(tabs, "ascending", oneRegion).map((tab) => tab.id)).toEqual(["c", "b", "a", "d"]);
	expect(sortTabs(tabs, "descending", oneRegion).map((tab) => tab.id)).toEqual(["d", "a", "b", "c"]);
});

test("tabs with equal names keep their relative order in both directions", () => {
	const tabs = [
		named("a", "Same"),
		named("b", "Other"),
		named("c", "same"),
		named("d", "Same", "Other"),
		named("e", "SAME"),
	];
	expect(sortTabs(tabs, "ascending", oneRegion).map((tab) => tab.id)).toEqual(["b", "d", "a", "c", "e"]);
	expect(sortTabs(tabs, "descending", oneRegion).map((tab) => tab.id)).toEqual(["a", "c", "e", "b", "d"]);
});

test("a sort reorders inside each contiguous region and keeps the regions in place", () => {
	const region = (tab: { id: string }) => tab.id[0]!;
	const tabs = [
		named("p2", "Zulu"),
		named("p1", "Alpha"),
		named("g2", "Yankee"),
		named("g1", "Bravo"),
		named("u2", "X-ray"),
		named("u1", "Charlie"),
	];
	expect(sortTabs(tabs, "ascending", region).map((tab) => tab.id)).toEqual(["p1", "p2", "g1", "g2", "u1", "u2"]);
	expect(sortTabs(tabs, "descending", region).map((tab) => tab.id)).toEqual(["p2", "p1", "g2", "g1", "u2", "u1"]);
	expect(sortTabs([], "ascending", region)).toEqual([]);
});

test("the store region separates pinned tabs, each group, and the ungrouped tail", () => {
	const base = { id: "a", url: "/a", title: "A", backHistory: [], forwardHistory: [] };
	expect(pageTabRegion(base)).toBe("");
	expect(pageTabRegion({ ...base, pinned: true })).toBe("pinned");
	expect(pageTabRegion({ ...base, groupId: "g1" })).toBe("group:g1");
	expect(pageTabRegion({ ...base, groupId: "g2" })).not.toBe(pageTabRegion({ ...base, groupId: "g1" }));
});

test("the store sort keeps the active tab, every tab record, and the saved order across reload", () => {
	const { open } = fixture();
	const store = open();
	const a = store.getState().activeId;
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().navigate({ url: "/usage", title: "Usage" });
	store.getState().goBack();
	store.getState().renameTab(a, "Zeta");
	const b = store.getState().addTab({ url: "/b", title: "Beta" });
	const c = store.getState().addTab({ url: "/c", title: "Alpha" });
	store.getState().selectTab(b);
	const before = new Map(store.getState().tabs.map((tab) => [tab.id, tab]));

	store.getState().sortTabs("ascending");
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, b, a]);
	expect(store.getState().activeId).toBe(b);
	for (const tab of store.getState().tabs) expect(tab).toBe(before.get(tab.id)!);
	expect(open().getState().tabs).toEqual(store.getState().tabs);

	store.getState().sortTabs("descending");
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([a, b, c]);
	expect(
		open()
			.getState()
			.tabs.map((tab) => tab.id),
	).toEqual([a, b, c]);
	expect(open("http://host-b").getState().tabs).toHaveLength(1);
});

test("a later title change and a manual move do not re-sort the tabs", () => {
	const { open } = fixture();
	const store = open();
	const a = store.getState().activeId;
	const b = store.getState().addTab({ url: "/b", title: "Beta" });
	const c = store.getState().addTab({ url: "/c", title: "Alpha" });
	store.getState().sortTabs("ascending");
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, b, a]);

	store.getState().setTitle("Aardvark");
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, b, a]);
	store.getState().renameTab(b, "Zulu");
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, b, a]);
	store.getState().moveTab(a, c);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([a, c, b]);
});

test("a sort handles many tabs and long names", () => {
	const { open } = fixture();
	const store = open();
	const long = "x".repeat(10_000);
	for (let index = 999; index >= 0; index--) store.getState().addTab({ url: `/${index}`, title: `${long} ${index}` });
	store.getState().sortTabs("ascending");
	const titles = store.getState().tabs.map((tab) => tab.title);
	expect(titles[0]).toBe("Needs you");
	expect(titles[1]).toBe(`${long} 0`);
	expect(titles[1000]).toBe(`${long} 999`);
	expect(store.getState().tabs).toHaveLength(1001);
});
