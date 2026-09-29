import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore, pageTabsSelectors, pageTabsStorageKey, pageTabsUiProjection } from "./pageTabsStore";

const memoryStorage = (entries = new Map<string, string>()): StateStorage => ({
	getItem: (key) => entries.get(key) ?? null,
	removeItem: (key) => entries.delete(key),
	setItem: (key, value) => entries.set(key, value),
});

const idSequence = () => {
	let value = 0;
	return () => `tab-${++value}`;
};

const createStore = (storage = memoryStorage(), origin = "http://host-a", createId = idSequence()) =>
	createPageTabsStore({
		origin,
		initialPage: { url: "/needs-you", title: "Needs you" },
		homePage: { url: "/needs-you", title: "Needs you" },
		storage,
		createId,
	});

const activeTab = (store: ReturnType<typeof createStore>) => {
	const state = store.getState();
	return state.tabs.find((tab) => tab.id === state.activeId)!;
};

test("each tab keeps its own current page and history", () => {
	const store = createStore();
	const firstId = store.getState().activeId;
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	const secondId = store.getState().addTab({ url: "/t/TRL-643", title: "TRL-643" });
	store.getState().navigate({ url: "/t/TRL-644", title: "TRL-644" });
	store.getState().selectTab(firstId);
	store.getState().goBack();

	expect(activeTab(store)).toMatchObject({
		id: firstId,
		url: "/needs-you",
		title: "Needs you",
		backHistory: [],
		forwardHistory: [{ url: "/p/TRL", title: "Trellis" }],
	});
	expect(store.getState().tabs.find((tab) => tab.id === secondId)).toMatchObject({
		url: "/t/TRL-644",
		title: "TRL-644",
		backHistory: [{ url: "/t/TRL-643", title: "TRL-643" }],
		forwardHistory: [],
	});
	store.getState().goForward();
	expect(activeTab(store)).toMatchObject({
		url: "/p/TRL",
		title: "Trellis",
		backHistory: [{ url: "/needs-you", title: "Needs you" }],
		forwardHistory: [],
	});
});

test("a navigation after Back replaces the forward history", () => {
	const store = createStore();
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	store.getState().navigate({ url: "/t/TRL-643", title: "TRL-643" });
	store.getState().goBack();
	store.getState().navigate({ url: "/search", title: "Search" });

	expect(activeTab(store)).toMatchObject({
		url: "/search",
		title: "Search",
		backHistory: [
			{ url: "/needs-you", title: "Needs you" },
			{ url: "/p/TRL", title: "Trellis" },
		],
		forwardHistory: [],
	});
	store.getState().goForward();
	expect(activeTab(store).url).toBe("/search");
});

test("replace updates the current page without a history entry", () => {
	const store = createStore();
	store.getState().navigate({ url: "/p/TRL?priority=high", title: "Trellis" });
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().goBack();
	store.getState().replace({ url: "/p/TRL?priority=high&sort=-updatedAt", title: "Trellis" });

	expect(activeTab(store)).toMatchObject({
		url: "/p/TRL?priority=high&sort=-updatedAt",
		title: "Trellis",
		backHistory: [{ url: "/needs-you", title: "Needs you" }],
		forwardHistory: [{ url: "/search", title: "Search" }],
	});
});

test("a navigation to the current URL updates its title without a history entry", () => {
	const store = createStore();
	store.getState().navigate({ url: "/needs-you", title: "Needs you (2)" });

	expect(activeTab(store)).toMatchObject({
		url: "/needs-you",
		title: "Needs you (2)",
		backHistory: [],
		forwardHistory: [],
	});
});

test("closing the active tab selects the tab on its right, then its left", () => {
	const store = createStore();
	const firstId = store.getState().activeId;
	const secondId = store.getState().addTab({ url: "/search", title: "Search" });
	const thirdId = store.getState().addTab({ url: "/settings", title: "Settings" });
	store.getState().selectTab(secondId);
	store.getState().closeTab(secondId);

	expect(store.getState().activeId).toBe(thirdId);
	store.getState().closeTab(thirdId);
	expect(store.getState().activeId).toBe(firstId);
});

test("closing an inactive tab keeps the active tab", () => {
	const store = createStore();
	const firstId = store.getState().activeId;
	const secondId = store.getState().addTab({ url: "/search", title: "Search" });
	store.getState().closeTab(firstId);

	expect(store.getState().activeId).toBe(secondId);
});

test("closing the last tab opens one usable home tab", () => {
	const store = createStore();
	const firstId = store.getState().activeId;
	store.getState().navigate({ url: "/settings", title: "Settings" });
	store.getState().closeTab(firstId);

	expect(store.getState().tabs).toEqual([
		{
			id: "tab-2",
			url: "/needs-you",
			title: "Needs you",
			backHistory: [],
			forwardHistory: [],
		},
	]);
	expect(store.getState().activeId).toBe("tab-2");
});

test("tabs and the active selection restore for the same origin", () => {
	const storage = memoryStorage();
	const store = createStore(storage, "http://host-a", idSequence());
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	const activeId = store.getState().addTab({ url: "/search", title: "Search" });

	const restored = createStore(storage, "http://host-a", idSequence());

	expect(restored.getState().tabs).toEqual(store.getState().tabs);
	expect(restored.getState().activeId).toBe(activeId);
});

test("different origins use separate saved tabs", () => {
	const storage = memoryStorage();
	const first = createStore(storage, "http://host-a", idSequence());
	first.getState().navigate({ url: "/p/TRL", title: "Trellis" });

	const second = createStore(storage, "http://host-b", idSequence());

	expect(activeTab(second).url).toBe("/needs-you");
	expect(pageTabsStorageKey("http://host-a")).not.toBe(pageTabsStorageKey("http://host-b"));
});

test("the UI projection contains the structural tab fields", () => {
	const store = createStore();
	const tabs = pageTabsSelectors.tabs(store.getState());
	const activeId = pageTabsSelectors.activeId(store.getState());
	const projection = pageTabsUiProjection(tabs, [], activeId);

	expect(projection.activeId).toBe("tab-1");
	expect(projection.tabs).toEqual([{ id: "tab-1", title: "Needs you", pinned: false, groupId: undefined }]);
	expect(projection.groups).toEqual([]);
});

test("the UI selectors return stable store fields", () => {
	const store = createStore();
	const state = store.getState();

	expect(pageTabsSelectors.tabs(state)).toBe(state.tabs);
	expect(pageTabsSelectors.activeId(state)).toBe(state.activeId);
});

test("a pin moves the tab to the end of the pinned region and keeps its record", () => {
	const store = createStore();
	const a = store.getState().activeId;
	store.getState().navigate({ url: "/search", title: "Search" });
	store.getState().renameTab(a, "Mine");
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	store.getState().setPinned(c, true);
	store.getState().setPinned(a, true);

	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, a, b]);
	expect(store.getState().tabs[1]).toEqual({
		id: a,
		url: "/search",
		title: "Search",
		customTitle: "Mine",
		pinned: true,
		backHistory: [{ url: "/needs-you", title: "Needs you" }],
		forwardHistory: [],
	});
	expect(store.getState().activeId).toBe(c);
	expect(pageTabsUiProjection(store.getState().tabs, [], c).tabs).toEqual([
		{ id: c, title: "C", pinned: true, groupId: undefined },
		{ id: a, title: "Mine", pinned: true, groupId: undefined },
		{ id: b, title: "B", pinned: false, groupId: undefined },
	]);
});

test("an unpin places the tab at the start of the unpinned region without a pinned field", () => {
	const store = createStore();
	const a = store.getState().activeId;
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	store.getState().setPinned(b, true);
	store.getState().setPinned(c, true);
	store.getState().setPinned(b, false);

	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([c, b, a]);
	expect("pinned" in store.getState().tabs[1]!).toBe(false);
	const same = store.getState().tabs;
	store.getState().setPinned(b, false);
	expect(store.getState().tabs).toBe(same);
});

test("a move keeps a tab inside its region", () => {
	const store = createStore();
	const a = store.getState().activeId;
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	const d = store.getState().addTab({ url: "/d", title: "D" });
	store.getState().setPinned(a, true);
	store.getState().setPinned(b, true);

	store.getState().moveTab(a, null);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([b, a, c, d]);
	store.getState().moveTab(d, a);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([b, a, d, c]);
	store.getState().moveTab(a, b);
	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([a, b, d, c]);
});

test("a closed pinned tab reopens inside the pinned region after the region shrinks", () => {
	const store = createStore();
	const a = store.getState().activeId;
	const b = store.getState().addTab({ url: "/b", title: "B" });
	const c = store.getState().addTab({ url: "/c", title: "C" });
	store.getState().setPinned(a, true);
	store.getState().setPinned(b, true);
	store.getState().closeTab(b);
	store.getState().setPinned(a, false);
	store.getState().reopenClosedTab();

	expect(store.getState().tabs.map((tab) => tab.id)).toEqual([b, a, c]);
	expect(store.getState().tabs[0]!.pinned).toBe(true);
});

test("the pinned state restores for the same origin", () => {
	const storage = memoryStorage();
	const store = createStore(storage, "http://host-a", idSequence());
	const b = store.getState().addTab({ url: "/b", title: "B" });
	store.getState().setPinned(b, true);

	const restored = createStore(storage, "http://host-a", idSequence());

	expect(restored.getState().tabs).toEqual(store.getState().tabs);
	expect(restored.getState().tabs[0]).toMatchObject({ id: b, pinned: true });
});
