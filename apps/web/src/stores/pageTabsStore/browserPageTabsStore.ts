import { createPageTabsStore, type PageTabPage } from "./pageTabsStore";

const currentPage = {
	url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
	title: document.title,
};

export const usePageTabsStore = createPageTabsStore({
	host: window.location.origin,
	initialPage: currentPage,
	homePage: { url: "/needs-you", title: "Needs you" },
	storage: window.localStorage,
});

export const pageTabsActions = {
	addTab: (page: PageTabPage) => usePageTabsStore.getState().addTab(page),
	selectTab: (id: string) => usePageTabsStore.getState().selectTab(id),
	closeTab: (id: string) => usePageTabsStore.getState().closeTab(id),
	navigate: (page: PageTabPage) => usePageTabsStore.getState().navigate(page),
	goBack: () => usePageTabsStore.getState().goBack(),
	goForward: () => usePageTabsStore.getState().goForward(),
	setTitle: (title: string) => usePageTabsStore.getState().setTitle(title),
};
