import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore, pageTabsStorageKey, pageTabsUiState } from "./pageTabsStore";

const memoryStorage = (entries = new Map<string, string>()): StateStorage => ({
	getItem: (key) => entries.get(key) ?? null,
	removeItem: (key) => entries.delete(key),
	setItem: (key, value) => entries.set(key, value),
});

const idSequence = () => {
	let value = 0;
	return () => `tab-${++value}`;
};

const createStore = (storage = memoryStorage(), host = "host-a", createId = idSequence()) =>
	createPageTabsStore({
		host,
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

test("tabs and the active selection restore for the same host", () => {
	const storage = memoryStorage();
	const store = createStore(storage, "host-a", idSequence());
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	const activeId = store.getState().addTab({ url: "/search", title: "Search" });

	const restored = createStore(storage, "host-a", idSequence());

	expect(restored.getState().tabs).toEqual(store.getState().tabs);
	expect(restored.getState().activeId).toBe(activeId);
});

test("different hosts use separate saved tabs", () => {
	const storage = memoryStorage();
	const first = createStore(storage, "host-a", idSequence());
	first.getState().navigate({ url: "/p/TRL", title: "Trellis" });

	const second = createStore(storage, "host-b", idSequence());

	expect(activeTab(second).url).toBe("/needs-you");
	expect(pageTabsStorageKey("host-a")).not.toBe(pageTabsStorageKey("host-b"));
});

test("the UI projection contains the structural tab fields", () => {
	const store = createStore();
	const projection = pageTabsUiState(store.getState());

	expect(projection.activeId).toBe("tab-1");
	expect(projection.tabs).toEqual([{ id: "tab-1", title: "Needs you" }]);
});
