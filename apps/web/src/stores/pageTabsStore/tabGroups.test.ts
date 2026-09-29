import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore } from "./pageTabsStore";
import { pageTabRegion } from "./tabGroups";

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
			createId: () => `id-${++id}`,
			initialPage: { url: "/needs-you", title: "Needs you" },
			homePage: { url: "/needs-you", title: "Needs you" },
		});
	return { open, entries };
};

const order = (store: ReturnType<ReturnType<typeof fixture>["open"]>) => store.getState().tabs.map((tab) => tab.id);

// a, b, c, d open in that order. b and c join group G; d joins group H.
const grouped = () => {
	const { open, entries } = fixture();
	const store = open();
	const a = store.getState().activeId;
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	const d = store.getState().addTab({ url: "/d", title: "D" });
	const g = store.getState().createGroup("Reviews");
	const h = store.getState().createGroup("Later");
	store.getState().setTabGroup(b, g);
	store.getState().setTabGroup(c, g);
	store.getState().setTabGroup(d, h);
	return { open, entries, store, a, b, c, d, g, h };
};

test("grouped tabs sit in contiguous blocks before the ungrouped tail", () => {
	const { store, a, b, c, d, g, h } = grouped();
	expect(order(store)).toEqual([b, c, d, a]);
	expect(store.getState().tabs.map(pageTabRegion)).toEqual([g, g, h, ""]);
	expect(store.getState().groups).toEqual([
		{ id: g, name: "Reviews", collapsed: false },
		{ id: h, name: "Later", collapsed: false },
	]);
});

test("a tab keeps its id, page, history, and name through group changes", () => {
	const { store, b, g, h } = grouped();
	store.getState().selectTab(b);
	store.getState().navigate({ url: "/b/2", title: "B2" });
	store.getState().renameTab(b, "Mine");
	const before = store.getState().tabs.find((tab) => tab.id === b)!;
	store.getState().setTabGroup(b, h);
	store.getState().setTabGroup(b, null);
	store.getState().setTabGroup(b, g);
	const after = store.getState().tabs.find((tab) => tab.id === b)!;
	expect(after).toEqual(before);
	expect(store.getState().activeId).toBe(b);
});

test("a move stays inside the region of the moving tab", () => {
	const { store, a, b, c, d } = grouped();
	store.getState().moveTab(c, b);
	expect(order(store)).toEqual([c, b, d, a]);
	store.getState().moveTab(c, null);
	expect(order(store)).toEqual([b, c, d, a]);
	store.getState().moveTab(a, b);
	expect(order(store)).toEqual([b, c, d, a]);
	store.getState().moveTab(d, b);
	expect(order(store)).toEqual([b, c, d, a]);
});

test("removing a group keeps its tabs open at the start of the tail", () => {
	const { store, a, b, c, d, g, h } = grouped();
	store.getState().removeGroup(g);
	expect(order(store)).toEqual([d, b, c, a]);
	expect(store.getState().tabs.map(pageTabRegion)).toEqual([h, "", "", ""]);
	expect(store.getState().groups.map((group) => group.id)).toEqual([h]);
	expect(store.getState().tabs.find((tab) => tab.id === b)).not.toHaveProperty("groupId");
});

test("leaving a group places the tab at the start of the tail", () => {
	const { store, a, b, c, d } = grouped();
	store.getState().setTabGroup(c, null);
	expect(order(store)).toEqual([b, d, c, a]);
});

test("a group that loses its last tab goes away", () => {
	const { store, d, g, h } = grouped();
	store.getState().setTabGroup(d, g);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g]);
	store.getState().setTabGroup(d, null);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g]);
	const fresh = store.getState().createGroup("Fresh");
	const later = store.getState().createGroup("Later again");
	store.getState().setTabGroup(d, fresh);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g, fresh, later]);
	expect(store.getState().groups.find((group) => group.id === h)).toBeUndefined();
});

test("selecting a tab of a collapsed group expands the group", () => {
	const { store, a, c, d, g } = grouped();
	store.getState().selectTab(a);
	store.getState().setGroupCollapsed(g, true);
	expect(store.getState().groups[0]!.collapsed).toBe(true);
	store.getState().selectTab(c);
	expect(store.getState().groups[0]!.collapsed).toBe(false);
	store.getState().setGroupCollapsed(g, true);
	expect(store.getState().activeId).toBe(d);
	store.getState().selectAdjacentTab(-1);
	expect(store.getState().activeId).toBe(c);
	expect(store.getState().groups[0]!.collapsed).toBe(false);
});

test("collapsing the group of the selected tab selects the nearest tab outside it", () => {
	const { store, a, b, c, d, g, h } = grouped();
	store.getState().selectTab(c);
	store.getState().setGroupCollapsed(g, true);
	expect(store.getState().activeId).toBe(d);
	expect(store.getState().groups[0]!.collapsed).toBe(true);
	store.getState().setGroupCollapsed(h, true);
	expect(store.getState().activeId).toBe(a);
	store.getState().setTabGroup(a, h);
	store.getState().setTabGroup(d, null);
	store.getState().selectTab(a);
	store.getState().setGroupCollapsed(h, true);
	expect(store.getState().activeId).toBe(d);
	const groupH = () => store.getState().groups.find((group) => group.id === h)!;
	store.getState().setTabGroup(b, h);
	store.getState().setTabGroup(c, h);
	expect(groupH().collapsed).toBe(true);
	store.getState().setTabGroup(d, h);
	expect(groupH().collapsed).toBe(false);
	store.getState().setGroupCollapsed(h, true);
	expect(groupH().collapsed).toBe(false);
	expect(store.getState().activeId).toBe(d);
});

test("closing the last tab of a group removes the group, and reopen restores both", () => {
	const { store, a, b, c, d, g, h } = grouped();
	store.getState().closeTab(d);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g]);
	store.getState().reopenClosedTab();
	expect(store.getState().groups.map((group) => group.id)).toEqual([g, h]);
	expect(order(store)).toEqual([b, c, d, a]);
	expect(store.getState().activeId).toBe(d);
	store.getState().closeTab(b);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g, h]);
	store.getState().reopenClosedTab();
	expect(order(store)).toEqual([b, c, d, a]);
});

test("a reopened tab lands inside its region", () => {
	const { store, a, b, c, d } = grouped();
	store.getState().closeTab(a);
	store.getState().moveTab(c, b);
	store.getState().reopenClosedTab();
	expect(order(store)).toEqual([c, b, d, a]);
});

test("closing an active tab of another group expands the group of the next tab", () => {
	const { store, a, c, d, h } = grouped();
	store.getState().selectTab(c);
	store.getState().setGroupCollapsed(h, true);
	store.getState().closeTab(c);
	expect(store.getState().activeId).toBe(d);
	expect(store.getState().groups[1]!.collapsed).toBe(false);
	expect(store.getState().tabs.map((tab) => tab.id)).toContain(a);
});

test("groups, membership, order, and collapsed state survive reload per host", () => {
	const { store, open, g } = grouped();
	store.getState().renameGroup(g, "Reviews today");
	store.getState().setGroupCollapsed(g, true);
	const restored = open();
	expect(restored.getState().tabs).toEqual(store.getState().tabs);
	expect(restored.getState().groups).toEqual(store.getState().groups);
	expect(restored.getState().groups[0]).toMatchObject({ name: "Reviews today", collapsed: true });
	expect(open("http://host-b").getState().groups).toEqual([]);
});

test("saved state without groups reads as no group", () => {
	const { open, entries } = fixture();
	const store = open();
	store.getState().navigate({ url: "/search", title: "Search" });
	const key = [...entries.keys()][0]!;
	const saved = JSON.parse(entries.get(key)!);
	delete saved.state.groups;
	entries.set(key, JSON.stringify(saved));
	const restored = open();
	expect(restored.getState().groups).toEqual([]);
	expect(restored.getState().tabs).toEqual(store.getState().tabs);
});

test("a pin leaves the group and an unpin lands at the start of the tail", () => {
	const { store, a, b, c, d, g, h } = grouped();
	store.getState().setPinned(c, true);
	expect(order(store)).toEqual([c, b, d, a]);
	expect(store.getState().tabs.map(pageTabRegion)).toEqual(["pinned", g, h, ""]);
	store.getState().setPinned(d, true);
	expect(order(store)).toEqual([c, d, b, a]);
	expect(store.getState().groups.map((group) => group.id)).toEqual([g]);
	store.getState().setPinned(c, false);
	expect(order(store)).toEqual([d, b, c, a]);
	expect(store.getState().tabs.map(pageTabRegion)).toEqual(["pinned", g, "", ""]);
	expect(store.getState().tabs.find((tab) => tab.id === c)).not.toHaveProperty("groupId");
	store.getState().setTabGroup(d, g);
	expect(order(store)).toEqual([d, b, c, a]);
	store.getState().moveTab(d, a);
	expect(order(store)).toEqual([d, b, c, a]);
});

test("the store caps neither groups nor tabs", () => {
	const { store } = grouped();
	for (let index = 0; index < 500; index++) {
		const id = store.getState().createGroup(`Group ${index}`);
		store.getState().setTabGroup(store.getState().addTab({ url: `/g/${index}`, title: `G${index}` }), id);
	}
	expect(store.getState().groups).toHaveLength(502);
	expect(store.getState().tabs).toHaveLength(504);
});
