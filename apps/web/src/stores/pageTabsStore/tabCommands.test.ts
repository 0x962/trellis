import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore, pageTabsStorageKey } from "./pageTabsStore";

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

test("a move preserves the selected tab and both histories across reload", () => {
	const { open } = fixture();
	const store = open();
	const a = store.getState().activeId;
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().navigate({ url: "/usage", title: "Usage" });
	store.getState().goBack();
	const original = store.getState().tabs[0]!;
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	store.getState().moveTab(a, null);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([b, c, a]);
	store.getState().moveTab(a, c);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([b, a, c]);
	expect(store.getState().tabs[1]).toBe(original);
	expect(store.getState().activeId).toBe(c);
	store.getState().moveTab(a, a);
	expect(open().getState().tabs).toEqual(store.getState().tabs);
	expect(open("http://host-b").getState().tabs).toHaveLength(1);
});

test("repeated close and reopen restores exact tabs and positions after reload", () => {
	const { open } = fixture();
	const store = open();
	const a = store.getState().activeId;
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().navigate({ url: "/usage", title: "Usage" });
	store.getState().goBack();
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	const original = store.getState().tabs;
	store.getState().closeTab(b);
	store.getState().closeTab(a);
	store.getState().closeTab(c);
	const restored = open();
	expect(open("http://host-b").getState().closedTabs).toEqual([]);
	restored.getState().reopenClosedTab();
	expect(restored.getState().tabs.map((tab) => tab.id)).toEqual([c]);
	restored.getState().reopenClosedTab();
	restored.getState().reopenClosedTab();
	expect(restored.getState().tabs).toEqual(original);
	expect(restored.getState().activeId).toBe(b);
	restored.getState().reopenClosedTab();
	expect(restored.getState().tabs).toEqual(original);
});

test("reopen preserves a replacement home tab after the person uses it", () => {
	const { open } = fixture();
	const store = open();
	const a = store.getState().activeId;
	store.getState().closeTab(a);
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().reopenClosedTab();
	expect(store.getState().tabs.map((tab) => tab.url)).toEqual(["/needs-you", "/search"]);
});

test("existing saved tabs load with an empty closed stack", () => {
	const { open, entries } = fixture();
	const store = open();
	store.getState().navigate({ url: "/search", title: "Search" });
	const { tabs, activeId } = store.getState();
	entries.set(pageTabsStorageKey("http://host-a"), JSON.stringify({ state: { tabs, activeId }, version: 0 }));
	const restored = open();
	expect(restored.getState().tabs).toEqual(tabs);
	expect(restored.getState().closedTabs).toEqual([]);
	restored.getState().closeTab(activeId);
	restored.getState().reopenClosedTab();
	expect(restored.getState().tabs).toEqual(tabs);
});

test("the closed stack retains more than one hundred closures", () => {
	const { open } = fixture();
	const store = open();
	for (let index = 0; index < 125; index++) store.getState().closeTab(store.getState().activeId);
	const restored = open();
	expect(restored.getState().closedTabs).toHaveLength(125);
	for (let index = 0; index < 125; index++) restored.getState().reopenClosedTab();
	expect(restored.getState().tabs[0]!.id).toBe("tab-1");
	expect(restored.getState().closedTabs).toEqual([]);
});

test("custom names survive navigation, automatic titles, moves, reopen, and restart", () => {
	const { open } = fixture();
	const store = open();
	const id = store.getState().activeId;
	store.getState().renameTab(id, "  My work  ");
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().setTitle("Search results");
	const other = store.getState().addTab({ url: "/usage", title: "Usage" });
	store.getState().moveTab(id, null);
	store.getState().closeTab(id);
	const restored = open();
	restored.getState().reopenClosedTab();
	expect(restored.getState().tabs.map((tab) => tab.id)).toEqual([other, id]);
	expect(restored.getState().tabs[1]).toMatchObject({
		customTitle: "My work",
		title: "Search results",
		url: "/search",
	});
	restored.getState().renameTab(id, "   ");
	expect(restored.getState().tabs[1]!.customTitle).toBeUndefined();
	expect(restored.getState().tabs[1]!.title).toBe("Search results");
	restored.getState().renameTab(id, "Named");
	restored.getState().renameTab(id, null);
	expect(open().getState().tabs[1]!.customTitle).toBeUndefined();
});
