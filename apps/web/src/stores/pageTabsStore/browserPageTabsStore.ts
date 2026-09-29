import { createPageTabsStore, type PageTabPage } from "./pageTabsStore";
import type { PageTabSortDirection } from "./sortTabs";

const currentPage = {
	url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
	title: document.title,
};

export const usePageTabsStore = createPageTabsStore({
	origin: window.location.origin,
	initialPage: currentPage,
	homePage: { url: "/needs-you", title: "Needs you" },
	storage: window.localStorage,
});

export const pageTabsActions = {
	createGroup: (name: string) => usePageTabsStore.getState().createGroup(name),
	renameGroup: (id: string, name: string) => usePageTabsStore.getState().renameGroup(id, name),
	removeGroup: (id: string) => usePageTabsStore.getState().removeGroup(id),
	setGroupCollapsed: (id: string, collapsed: boolean) => usePageTabsStore.getState().setGroupCollapsed(id, collapsed),
	setTabGroup: (id: string, groupId: string | null) => usePageTabsStore.getState().setTabGroup(id, groupId),
	renameTab: (id: string, title: string | null) => usePageTabsStore.getState().renameTab(id, title),
	setPinned: (id: string, pinned: boolean) => usePageTabsStore.getState().setPinned(id, pinned),
	moveTab: (id: string, beforeId: string | null) => usePageTabsStore.getState().moveTab(id, beforeId),
	sortTabs: (direction: PageTabSortDirection) => usePageTabsStore.getState().sortTabs(direction),
	reopenClosedTab: () => usePageTabsStore.getState().reopenClosedTab(),
	addTab: (page: PageTabPage) => usePageTabsStore.getState().addTab(page),
	selectTab: (id: string) => usePageTabsStore.getState().selectTab(id),
	selectAdjacentTab: (offset: 1 | -1) => usePageTabsStore.getState().selectAdjacentTab(offset),
	closeTab: (id: string) => usePageTabsStore.getState().closeTab(id),
	navigate: (page: PageTabPage) => usePageTabsStore.getState().navigate(page),
	replace: (page: PageTabPage) => usePageTabsStore.getState().replace(page),
	goBack: () => usePageTabsStore.getState().goBack(),
	goForward: () => usePageTabsStore.getState().goForward(),
	setTitle: (title: string) => usePageTabsStore.getState().setTitle(title),
};
