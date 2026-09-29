import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { sortTabs, visibleTabName } from "./sortTabs";
import { expandGroupOf, groupEnd, insertIndex, pageTabRegion, removeGroupIfEmpty, tailStart } from "./tabGroups";
import type {
	ClosedPageTab,
	CreatePageTabsStoreOptions,
	PageTab,
	PageTabGroup,
	PageTabPage,
	PageTabsState,
	PageTabsUiState,
} from "./types";

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

// The strip reads this projection. It leaves the selection out, so a change
// of the selected tab alone keeps the projected arrays and every memo that
// hangs on them.
export const pageTabsUiProjection = (tabs: readonly PageTab[], groups: readonly PageTabGroup[]): PageTabsUiState => ({
	tabs: tabs.map((tab) => ({
		id: tab.id,
		title: visibleTabName(tab),
		pinned: tab.pinned === true,
		groupId: tab.groupId,
	})),
	groups,
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
						return { groups: expandGroupOf(groups, next), activeId: next.id };
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
						if (current.pinned || (current.groupId ?? null) === groupId) return state;
						const { groupId: _, ...bare } = current;
						const moved = groupId === null ? bare : { ...bare, groupId };
						const rest = state.tabs.filter((item) => item.id !== id);
						rest.splice(groupId === null ? tailStart(rest) : groupEnd(rest, state.groups, groupId), 0, moved);
						const groups = removeGroupIfEmpty(rest, state.groups, current.groupId);
						return { tabs: rest, groups: id === state.activeId ? expandGroupOf(groups, moved) : groups };
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
				setPinned: (id, pinned) =>
					set((state) => {
						const { pinned: _pinned, groupId, ...current } = state.tabs.find((item) => item.id === id)!;
						if ((_pinned === true) === pinned) return state;
						// A pin leaves the group; an unpin lands at the start of the
						// ungrouped tail.
						const moving: PageTab = pinned ? { ...current, pinned: true } : current;
						const tabs = state.tabs.filter((item) => item.id !== id);
						tabs.splice(pinned ? insertIndex(tabs, state.groups, moving, tabs.length) : tailStart(tabs), 0, moving);
						return { tabs, groups: removeGroupIfEmpty(tabs, state.groups, groupId) };
					}),
				moveTab: (id, beforeId) =>
					set((state) => {
						if (id === beforeId) return state;
						const moving = state.tabs.find((item) => item.id === id)!;
						const tabs = state.tabs.filter((item) => item.id !== id);
						const wanted = beforeId === null ? tabs.length : tabs.findIndex((item) => item.id === beforeId);
						tabs.splice(insertIndex(tabs, state.groups, moving, wanted), 0, moving);
						return { tabs };
					}),
				sortTabs: (direction) => set((state) => ({ tabs: sortTabs(state.tabs, direction, pageTabRegion) })),
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
						const groups = emptied ? state.groups.filter((group) => group.id !== closed.groupId) : state.groups;
						return {
							tabs,
							groups: state.activeId === id ? expandGroupOf(groups, next) : groups,
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
						const groups = [...state.groups];
						if (closed.group) groups.splice(closed.group.index, 0, closed.group.group);
						tabs.splice(insertIndex(tabs, groups, closed.tab, closed.index), 0, closed.tab);
						return {
							tabs,
							groups: expandGroupOf(groups, closed.tab),
							activeId: closed.tab.id,
							closedTabs: state.closedTabs.slice(0, -1),
						};
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
