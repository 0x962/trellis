import type { StateStorage } from "zustand/middleware";
import type { PageTabSortDirection } from "./sortTabs";

export type PageTabPage = {
	url: string;
	title: string;
};

export type PageTab = PageTabPage & {
	id: string;
	customTitle?: string;
	pinned?: boolean;
	// The group the tab belongs to. Absent means the tab is ungrouped. A
	// pinned tab has no group.
	groupId?: string;
	backHistory: PageTabPage[];
	forwardHistory: PageTabPage[];
};

export type PageTabGroup = {
	id: string;
	name: string;
	collapsed: boolean;
};

export type PageTabItem = Pick<PageTab, "id" | "title" | "groupId"> & { pinned: boolean };

// A tab that closed, with what reopen needs to put it back: its position, the
// home tab that replaced it when it was the last tab, and its group when the
// close removed that group.
export type ClosedPageTab = {
	tab: PageTab;
	index: number;
	replacementId: string | null;
	group?: { group: PageTabGroup; index: number };
};

// The tab strip has one order, `tabs`: the pinned tabs, then the block of
// each group in `groups` order, then the ungrouped tail. Every tab of a
// group sits inside its block. `tabGroups.ts` holds the region rules.
export type PageTabsState = {
	tabs: PageTab[];
	groups: PageTabGroup[];
	activeId: string;
	closedTabs: ClosedPageTab[];
	createGroup: (name: string) => string;
	renameGroup: (id: string, name: string) => void;
	removeGroup: (id: string) => void;
	setGroupCollapsed: (id: string, collapsed: boolean) => void;
	setTabGroup: (id: string, groupId: string | null) => void;
	renameTab: (id: string, title: string | null) => void;
	setPinned: (id: string, pinned: boolean) => void;
	moveTab: (id: string, beforeId: string | null) => void;
	sortTabs: (direction: PageTabSortDirection) => void;
	reopenClosedTab: () => void;
	addTab: (page: PageTabPage) => string;
	selectTab: (id: string) => void;
	selectAdjacentTab: (offset: 1 | -1) => void;
	closeTab: (id: string) => void;
	navigate: (page: PageTabPage) => void;
	replace: (page: PageTabPage) => void;
	goBack: () => void;
	goForward: () => void;
	setTitle: (title: string) => void;
};

export type PageTabsUiState = {
	tabs: readonly PageTabItem[];
	groups: readonly PageTabGroup[];
};

export type CreatePageTabsStoreOptions = {
	origin: string;
	initialPage: PageTabPage;
	homePage: PageTabPage;
	storage: StateStorage;
	createId?: () => string;
};
