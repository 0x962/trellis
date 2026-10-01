import { expect, test } from "bun:test";
import { createPageTabsStore, pageTabsStorageKey } from "../../../stores/pageTabsStore/pageTabsStore";
import { createPageTabsHistory } from "./pageTabsHistory";

const origin = "http://pinned-tabs.test";
const fixture = () => {
	const entries = new Map<string, string>();
	let id = 0;
	const open = (href: string, navigationType: PerformanceNavigationTiming["type"] = "reload") => {
		const writes: string[] = [];
		const store = createPageTabsStore({
			origin,
			initialPage: { url: href, title: "Trellis" },
			homePage: { url: "/search", title: "Search" },
			storage: {
				getItem: (key) => entries.get(key) ?? null,
				setItem: (key, value) => entries.set(key, value),
				removeItem: (key) => entries.delete(key),
			},
			createId: () => `tab-${++id}`,
		});
		const history = createPageTabsHistory({
			store,
			initialTitle: "Trellis",
			browser: {
				location: new URL(href, origin),
				performance: { getEntriesByType: () => [{ type: navigationType } as PerformanceNavigationTiming] },
				history: {
					state: {},
					replaceState: (_state, _unused, url) => writes.push(String(url)),
				},
			},
		});
		return { store, history, writes };
	};
	return { entries, open };
};

test.each([
	{ url: "/settings?panel=accounts#current", type: "reload" as const },
	{ url: "/", type: "reload" as const },
	{ url: "/", type: "navigate" as const },
])("startup at $url with navigation type $type restores the active pin", ({ url, type }) => {
	const f = fixture();
	const { store, history } = f.open("/search");
	const id = store.getState().activeId;
	history.push("/p/TRL?view=board#current");
	store.getState().setTitle("Trellis board");
	store.getState().renameTab(id, "My project");
	store.getState().setPinned(id, true);
	history.push("/settings?panel=accounts#current");
	const prior = store.getState().tabs[0]!;

	const restored = f.open(url, type);
	const tab = restored.store.getState().tabs[0]!;
	expect(restored.history.location.href).toBe("/p/TRL?view=board#current");
	expect(restored.writes).toEqual(["/p/TRL?view=board#current"]);
	expect(tab).toMatchObject({ id, title: "Trellis board", customTitle: "My project", pinned: true });
	expect(tab.backHistory).toEqual([...prior.backHistory, { url: prior.url, title: prior.title }]);
	expect(tab.forwardHistory).toEqual(prior.forwardHistory);
	expect(f.open(tab.url).store.getState().tabs).toEqual(restored.store.getState().tabs);
});

test("reload restores inactive pins and retains the ordinary active tab", () => {
	const f = fixture();
	const { store, history } = f.open("/search");
	const first = store.getState().activeId;
	store.getState().setPinned(first, true);
	const second = store.getState().addTab({ url: "/ai/flows", title: "Flows" });
	store.getState().setPinned(second, true);
	const ordinary = store.getState().addTab({ url: "/settings", title: "Settings" });
	store.getState().selectTab(first);
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	store.getState().selectTab(second);
	store.getState().navigate({ url: "/sessions/one", title: "Session" });
	store.getState().selectTab(ordinary);
	expect(store.getState().tabs.map((tab) => tab.url)).toEqual(["/p/TRL", "/sessions/one", "/settings"]);
	const prior = store.getState().tabs.at(-1);
	history.replace("/settings");

	const restored = f.open("/settings");
	expect(restored.history.location.href).toBe("/settings");
	expect(restored.store.getState().activeId).toBe(ordinary);
	expect(restored.store.getState().tabs.map((tab) => [tab.id, tab.url])).toEqual([
		[first, "/search"],
		[second, "/ai/flows"],
		[ordinary, "/settings"],
	]);
	expect(restored.store.getState().tabs.at(-1)).toEqual(prior);
});

test("navigation and history leave the pin destination unchanged", () => {
	const f = fixture();
	const { store, history } = f.open("/search");
	const id = store.getState().activeId;
	store.getState().setPinned(id, true);
	history.push("/p/TRL");
	history.push("/settings");
	history.back();
	store.getState().setTitle("Trellis project");
	store.getState().setPinned(id, true);
	const prior = store.getState().tabs[0]!;

	const restored = f.open("/p/TRL");
	expect(restored.history.location.href).toBe("/search");
	expect(restored.store.getState().tabs[0]!.forwardHistory).toEqual(prior.forwardHistory);
	restored.history.back();
	expect(restored.history.location.href).toBe("/p/TRL");
	restored.history.forward();
	expect(restored.history.location.href).toBe("/search");
});

test("unpin retains the current page and repin chooses a new destination", () => {
	const f = fixture();
	const first = f.open("/search");
	const id = first.store.getState().activeId;
	first.store.getState().setPinned(id, true);
	first.history.push("/settings");
	first.store.getState().setPinned(id, false);
	expect(first.store.getState().tabs[0]).not.toHaveProperty("pinnedPage");
	const unpinned = f.open("/settings");
	expect(unpinned.history.location.href).toBe("/settings");
	unpinned.store.getState().setPinned(id, true);
	unpinned.history.push("/p/TRL");
	expect(f.open("/p/TRL").history.location.href).toBe("/settings");
});

test("an explicit direct URL opens after the pinned pages restore", () => {
	const f = fixture();
	const { store, history } = f.open("/search");
	store.getState().setPinned(store.getState().activeId, true);
	history.push("/settings");
	const direct = f.open("/t/TRL-1312?tab=activity#agent", "navigate");
	expect(direct.history.location.href).toBe("/t/TRL-1312?tab=activity#agent");
	expect(f.open(direct.history.location.href).history.location.href).toBe("/search");
});

test("a direct entry to the saved active URL keeps that requested page", () => {
	const f = fixture();
	const { store, history } = f.open("/search");
	store.getState().setPinned(store.getState().activeId, true);
	history.push("/settings?panel=accounts#current");
	history.push("/p/TRL");
	history.back();
	const prior = store.getState().tabs;
	const direct = f.open(history.location.href, "navigate");
	expect(direct.history.location.href).toBe("/settings?panel=accounts#current");
	expect(direct.store.getState().tabs).toEqual(prior);
	expect(f.open(direct.history.location.href).history.location.href).toBe("/search");
});

test("saved pins without destinations adopt their current pages", () => {
	const f = fixture();
	const oldTab = {
		id: "old",
		url: "/p/TRL?view=list#mine",
		title: "Project",
		pinned: true,
		backHistory: [],
		forwardHistory: [],
	};
	f.entries.set(pageTabsStorageKey(origin), JSON.stringify({ state: { tabs: [oldTab], activeId: "old" }, version: 0 }));
	const restored = f.open(oldTab.url);
	expect(restored.store.getState().groups).toEqual([]);
	expect(restored.store.getState().closedTabs).toEqual([]);
	restored.history.push("/settings");
	expect(f.open("/settings").history.location.href).toBe(oldTab.url);
});

test("a closed pin retains its destination across a reload and reopen", () => {
	const f = fixture();
	const { store, history } = f.open("/search");
	const id = store.getState().activeId;
	store.getState().setPinned(id, true);
	history.push("/settings");
	store.getState().closeTab(id);
	const restored = f.open("/");
	restored.store.getState().reopenClosedTab();
	expect(restored.store.getState().tabs[0]!.url).toBe("/settings");
	expect(f.open("/settings").history.location.href).toBe("/search");
});

test("a closed pin from an earlier release adopts its saved page before it reopens", () => {
	const f = fixture();
	const { store } = f.open("/search");
	const id = store.getState().activeId;
	store.getState().setPinned(id, true);
	store.getState().closeTab(id);
	const key = pageTabsStorageKey(origin);
	const saved = JSON.parse(f.entries.get(key)!);
	delete saved.state.closedTabs[0].tab.pinnedPage;
	f.entries.set(key, JSON.stringify(saved));
	const restored = f.open("/", "navigate");
	restored.store.getState().reopenClosedTab();
	restored.history.push("/settings");
	expect(f.open("/settings").history.location.href).toBe("/search");
});
