import { expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { createPageTabsStore } from "../../../stores/pageTabsStore/pageTabsStore";
import { createPageTabsHistory } from "./pageTabsHistory";

const memoryStorage = (): StateStorage => ({
	getItem: () => null,
	removeItem: () => {},
	setItem: () => {},
});

const createStore = () => {
	let id = 0;
	return createPageTabsStore({
		origin: "http://trellis.test",
		initialPage: { url: "/needs-you", title: "Needs you" },
		homePage: { url: "/needs-you", title: "Needs you" },
		storage: memoryStorage(),
		createId: () => `tab-${++id}`,
	});
};

const createBrowser = (href: string) => {
	const parsed = new URL(href, "http://trellis.test");
	const writes: string[] = [];
	const history = {
		state: {},
		replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => {
			if (url !== undefined && url !== null) writes.push(String(url));
		},
	};
	return {
		browser: { location: parsed, history },
		writes,
	};
};

const activeTab = (store: ReturnType<typeof createStore>) => {
	const state = store.getState();
	return state.tabs.find((tab) => tab.id === state.activeId)!;
};

test("restores the saved active page from the generic desktop landing route", () => {
	const store = createStore();
	store.getState().navigate({ url: "/p/TRL/epics?status=todo#current", title: "Trellis epics" });
	const { browser, writes } = createBrowser("/");

	const history = createPageTabsHistory({ store, browser, initialTitle: "Trellis" });

	expect(history.location.href).toBe("/p/TRL/epics?status=todo#current");
	expect(writes).toEqual(["/p/TRL/epics?status=todo#current"]);
});

test("keeps an explicit direct URL with its query and hash", () => {
	const store = createStore();
	store.getState().navigate({ url: "/p/TRL", title: "Trellis" });
	const { browser } = createBrowser("/t/TRL-645?tab=activity#agent");

	const history = createPageTabsHistory({ store, browser, initialTitle: "Trellis" });

	expect(history.location.href).toBe("/t/TRL-645?tab=activity#agent");
	expect(activeTab(store).backHistory).toEqual([
		{ url: "/needs-you", title: "Needs you" },
		{ url: "/p/TRL", title: "Trellis" },
	]);
});

test("keeps independent back and forward history after a tab switch", () => {
	const store = createStore();
	const firstId = store.getState().activeId;
	const { browser } = createBrowser("/needs-you");
	const history = createPageTabsHistory({ store, browser, initialTitle: "Needs you" });
	history.push("/p/TRL?view=board#top");
	const secondId = store.getState().addTab({ url: "/sessions/one", title: "Session one" });
	history.replace("/sessions/one");
	history.push("/sessions/two?view=terminal#bottom");
	history.back();

	expect(history.location.href).toBe("/sessions/one");
	expect(activeTab(store).forwardHistory).toEqual([
		{ url: "/sessions/two?view=terminal#bottom", title: "Session one" },
	]);
	store.getState().selectTab(firstId);
	history.replace("/p/TRL?view=board#top");
	expect(history.location.href).toBe("/p/TRL?view=board#top");
	expect(history.canGoBack()).toBe(true);
	history.back();
	expect(history.location.href).toBe("/needs-you");
	expect(store.getState().tabs.find((tab) => tab.id === secondId)?.url).toBe("/sessions/one");
});

test("replace changes the full URL without a new history entry", () => {
	const store = createStore();
	const { browser } = createBrowser("/needs-you");
	const history = createPageTabsHistory({ store, browser, initialTitle: "Needs you" });
	history.push("/reviews/o/r/1?tab=overview");
	history.replace("/reviews/o/r/1?tab=diff#file");

	expect(history.location.href).toBe("/reviews/o/r/1?tab=diff#file");
	expect(activeTab(store).backHistory).toEqual([{ url: "/needs-you", title: "Needs you" }]);
});
