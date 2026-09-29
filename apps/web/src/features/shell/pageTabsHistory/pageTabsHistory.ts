import { createHistory, type HistoryLocation, type RouterHistory } from "@tanstack/react-router";
import type { PageTabsState } from "../../../stores/pageTabsStore";

type PageTabsStore = {
	getState: () => PageTabsState;
};

type BrowserLocation = Pick<Location, "pathname" | "search" | "hash">;

type PageTabsBrowser = {
	location: BrowserLocation;
	history: Pick<History, "state" | "replaceState">;
};

type PageTabsHistoryOptions = {
	store: PageTabsStore;
	browser: PageTabsBrowser;
	initialTitle: string;
};

type Blocker = Parameters<RouterHistory["block"]>[0];

const browserHref = (location: BrowserLocation) => `${location.pathname}${location.search}${location.hash}`;

const parseHref = (href: string, state: HistoryLocation["state"]): HistoryLocation => {
	const parsed = new URL(href, "http://trellis.invalid");
	return {
		href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
		pathname: parsed.pathname,
		search: parsed.search,
		hash: parsed.hash,
		state,
	};
};

const activeTab = (store: PageTabsStore) => {
	const state = store.getState();
	return state.tabs.find((tab) => tab.id === state.activeId)!;
};

const locationState = (state: HistoryLocation["state"], index: number): HistoryLocation["state"] => ({
	...state,
	__TSR_index: index,
});

const syncBrowser = (browser: PageTabsBrowser, store: PageTabsStore, state: HistoryLocation["state"]) => {
	const tab = activeTab(store);
	browser.history.replaceState(locationState(state, tab.backHistory.length), "", tab.url);
};

export const createPageTabsHistory = ({ store, browser, initialTitle }: PageTabsHistoryOptions): RouterHistory => {
	const requestedUrl = browserHref(browser.location);
	if (requestedUrl !== "/" && requestedUrl !== activeTab(store).url) {
		store.getState().navigate({ url: requestedUrl, title: initialTitle });
	}

	let currentState = locationState(browser.history.state ?? {}, activeTab(store).backHistory.length);
	let blockers: Blocker[] = [];
	syncBrowser(browser, store, currentState);

	const updateState = (state: HistoryLocation["state"]) => {
		currentState = locationState(state, activeTab(store).backHistory.length);
		syncBrowser(browser, store, currentState);
	};
	const page = (url: string) => ({ url: parseHref(url, currentState).href, title: activeTab(store).title });

	return createHistory({
		getLocation: () => {
			const tab = activeTab(store);
			return parseHref(tab.url, locationState(currentState, tab.backHistory.length));
		},
		getLength: () => {
			const tab = activeTab(store);
			return tab.backHistory.length + 1 + tab.forwardHistory.length;
		},
		pushState: (path, state) => {
			store.getState().navigate(page(path));
			updateState(state);
		},
		replaceState: (path, state) => {
			store.getState().replace(page(path));
			updateState(state);
		},
		go: (distance) => {
			const action = distance < 0 ? "goBack" : "goForward";
			for (let count = 0; count < Math.abs(distance); count += 1) store.getState()[action]();
			updateState(currentState);
		},
		back: () => {
			store.getState().goBack();
			updateState(currentState);
		},
		forward: () => {
			store.getState().goForward();
			updateState(currentState);
		},
		createHref: (href) => href,
		getBlockers: () => blockers,
		setBlockers: (next) => {
			blockers = next;
		},
	});
};
