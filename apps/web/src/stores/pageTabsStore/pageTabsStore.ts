import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { expandGroupOf, groupEnd, insertIndex, tailStart } from "./tabGroups";

export type PageTabPage = {
	url: string;
	title: string;
};

export type PageTab = PageTabPage & {
	id: string;
	customTitle?: string;
	// The group the tab belongs to. Absent means the tab is ungrouped.
	groupId?: string;
	backHistory: PageTabPage[];
	forwardHistory: PageTabPage[];
};

export type PageTabGroup = {
	id: string;
	name: string;
	collapsed: boolean;
};

export type PageTabItem = Pick<PageTab, "id" | "title" | "groupId">;

// A tab that closed, with what reopen needs to put it back: its position, the
// home tab that replaced it when it was the last tab, and its group when the
// close removed that group.
export type ClosedPageTab = {
	tab: PageTab;
	index: number;
	replacementId: string | null;
	group?: { group: PageTabGroup; index: number };
};

// The tab strip has one order, `tabs`: the blocks of the groups in `groups`
// order, then the ungrouped tail. Every tab of a group sits inside its
// block. A move never crosses a region boundary; a group action moves a tab
// from one region to another.
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
	moveTab: (id: string, beforeId: string | null) => void;
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
	activeId: string;
};

export type CreatePageTabsStoreOptions = {
	origin: string;
	initialPage: PageTabPage;
	homePage: PageTabPage;
	storage: StateStorage;
	createId?: () => string;
};

export const pageTabsStorageKey = (origin: string) => `trellis-page-tabs:${encodeURIComponent(origin)}`;

const tab = (id: string, page: PageTabPage): PageTab => ({
	id,
	...page,
	backHistory: [],
	forwardHistory: [],
});

const updateActiveTab = (state: PageTabsState, update: (current: PageTab) => PageTab) => ({
	tabs: state.tabs.map((item) => (item.id === state.activeId ? update(item) : item)),
});

export const pageTabsSelectors = {
	tabs: (state: PageTabsState) => state.tabs,
	groups: (state: PageTabsState) => state.groups,
	activeId: (state: PageTabsState) => state.activeId,
};

export const pageTabsUiProjection = (
	tabs: readonly PageTab[],
	groups: readonly PageTabGroup[],
	activeId: string,
): PageTabsUiState => ({
	tabs: tabs.map(({ id, title, customTitle, groupId }) => ({ id, title: customTitle ?? title, groupId })),
	groups,
	activeId,
});

export const createPageTabsStore = (options: CreatePageTabsStoreOptions) => {
	const createId = options.createId ?? (() => crypto.randomUUID());
	const initial = tab(createId(), options.initialPage);

	return create<PageTabsState>()(
		persist(
			(set) => ({
				tabs: [initial],
				groups: [],
				activeId: initial.id,
				closedTabs: [],
				createGroup: (name) => {
					const id = createId();
					set((state) => ({ groups: [...state.groups, { id, name, collapsed: false }] }));
					return id;
				},
				renameGroup: (id, name) =>
					set((state) => ({
						groups: state.groups.map((group) => (group.id === id ? { ...group, name } : group)),
					})),
				setGroupCollapsed: (id, collapsed) =>
					set((state) => {
						const groups = state.groups.map((group) => (group.id === id ? { ...group, collapsed } : group));
						const active = state.tabs.find((item) => item.id === state.activeId)!;
						if (!collapsed || active.groupId !== id) return { groups };
						// A collapse hides the tabs of the group, so the selection moves to
						// the nearest tab outside it. A strip whose every tab is in the
						// group stays open.
						const outside = state.tabs.filter((item) => item.groupId !== id);
						if (outside.length === 0) return state;
						const end = groupEnd(state.tabs, state.groups, id);
						const next = state.tabs.slice(end).find((item) => item.groupId !== id) ?? outside.at(-1)!;
						return { groups, activeId: next.id };
					}),
				removeGroup: (id) =>
					set((state) => {
						const members = state.tabs.filter((item) => item.groupId === id).map(({ groupId: _, ...item }) => item);
						const rest = state.tabs.filter((item) => item.groupId !== id);
						rest.splice(tailStart(rest), 0, ...members);
						return { tabs: rest, groups: state.groups.filter((group) => group.id !== id) };
					}),
				setTabGroup: (id, groupId) =>
					set((state) => {
						const current = state.tabs.find((item) => item.id === id)!;
						if ((current.groupId ?? null) === groupId) return state;
						const { groupId: _, ...bare } = current;
						const moved = groupId === null ? bare : { ...bare, groupId };
						const rest = state.tabs.filter((item) => item.id !== id);
						rest.splice(groupId === null ? tailStart(rest) : groupEnd(rest, state.groups, groupId), 0, moved);
						return { tabs: rest, groups: id === state.activeId ? expandGroupOf(state.groups, moved) : state.groups };
					}),
				addTab: (page) => {
					const next = tab(createId(), page);
					set((state) => ({ tabs: [...state.tabs, next], activeId: next.id }));
					return next.id;
				},
				selectTab: (activeId) =>
					set((state) => ({
						activeId,
						groups: expandGroupOf(state.groups, state.tabs.find((item) => item.id === activeId)!),
					})),
				selectAdjacentTab: (offset) =>
					set((state) => {
						const index = state.tabs.findIndex((item) => item.id === state.activeId);
						const next = state.tabs[(index + offset + state.tabs.length) % state.tabs.length]!;
						return { activeId: next.id, groups: expandGroupOf(state.groups, next) };
					}),
				renameTab: (id, title) =>
					set((state) => ({
						tabs: state.tabs.map((item) =>
							item.id === id ? { ...item, customTitle: title?.trim() || undefined } : item,
						),
					})),
				moveTab: (id, beforeId) =>
					set((state) => {
						if (id === beforeId) return state;
						const moving = state.tabs.find((item) => item.id === id)!;
						const tabs = state.tabs.filter((item) => item.id !== id);
						const wanted = beforeId === null ? tabs.length : tabs.findIndex((item) => item.id === beforeId);
						tabs.splice(insertIndex(tabs, state.groups, moving, wanted), 0, moving);
						return { tabs };
					}),
				closeTab: (id) =>
					set((state) => {
						const index = state.tabs.findIndex((item) => item.id === id);
						const closed = state.tabs[index]!;
						const replacement = state.tabs.length === 1 ? tab(createId(), options.homePage) : null;
						const tabs = replacement ? [replacement] : state.tabs.filter((item) => item.id !== id);
						const groupIndex = state.groups.findIndex((group) => group.id === closed.groupId);
						const emptied = groupIndex !== -1 && !tabs.some((item) => item.groupId === closed.groupId);
						const record: ClosedPageTab = { tab: closed, index, replacementId: replacement?.id ?? null };
						if (emptied) record.group = { group: state.groups[groupIndex]!, index: groupIndex };
						const next = tabs[Math.min(index, tabs.length - 1)]!;
						return {
							tabs,
							groups: emptied
								? state.groups.filter((group) => group.id !== closed.groupId)
								: state.activeId === id
									? expandGroupOf(state.groups, next)
									: state.groups,
							activeId: state.activeId === id ? next.id : state.activeId,
							closedTabs: [...state.closedTabs, record],
						};
					}),
				reopenClosedTab: () =>
					set((state) => {
						const closed = state.closedTabs.at(-1);
						if (!closed) return state;
						const tabs = state.tabs.filter(
							(item) =>
								!(
									item.id === closed.replacementId &&
									item.url === options.homePage.url &&
									item.customTitle === undefined &&
									item.backHistory.length === 0 &&
									item.forwardHistory.length === 0
								),
						);
						const groups = closed.group ? [...state.groups] : expandGroupOf(state.groups, closed.tab);
						if (closed.group) groups.splice(closed.group.index, 0, closed.group.group);
						tabs.splice(insertIndex(tabs, groups, closed.tab, closed.index), 0, closed.tab);
						return { tabs, groups, activeId: closed.tab.id, closedTabs: state.closedTabs.slice(0, -1) };
					}),
				navigate: (page) =>
					set((state) =>
						updateActiveTab(state, (current) => {
							if (current.url === page.url) return { ...current, title: page.title };
							return {
								...current,
								...page,
								backHistory: [...current.backHistory, { url: current.url, title: current.title }],
								forwardHistory: [],
							};
						}),
					),
				replace: (page) => set((state) => updateActiveTab(state, (current) => ({ ...current, ...page }))),
				goBack: () =>
					set((state) =>
						updateActiveTab(state, (current) => {
							const page = current.backHistory.at(-1);
							if (page === undefined) return current;
							return {
								...current,
								...page,
								backHistory: current.backHistory.slice(0, -1),
								forwardHistory: [{ url: current.url, title: current.title }, ...current.forwardHistory],
							};
						}),
					),
				goForward: () =>
					set((state) =>
						updateActiveTab(state, (current) => {
							const [page, ...forwardHistory] = current.forwardHistory;
							if (page === undefined) return current;
							return {
								...current,
								...page,
								backHistory: [...current.backHistory, { url: current.url, title: current.title }],
								forwardHistory,
							};
						}),
					),
				setTitle: (title) => set((state) => updateActiveTab(state, (current) => ({ ...current, title }))),
			}),
			{
				name: pageTabsStorageKey(options.origin),
				storage: createJSONStorage(() => options.storage),
				partialize: (state) => ({
					tabs: state.tabs,
					groups: state.groups,
					activeId: state.activeId,
					closedTabs: state.closedTabs,
				}),
			},
		),
	);
};
