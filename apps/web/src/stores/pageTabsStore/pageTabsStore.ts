import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type PageTabPage = {
	url: string;
	title: string;
};

export type PageTab = PageTabPage & {
	id: string;
	customTitle?: string;
	backHistory: PageTabPage[];
	forwardHistory: PageTabPage[];
};

export type PageTabItem = Pick<PageTab, "id" | "title">;

export type PageTabsState = {
	tabs: PageTab[];
	activeId: string;
	closedTabs: { tab: PageTab; index: number; replacementId: string | null }[];
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
	activeId: (state: PageTabsState) => state.activeId,
};

export const pageTabsUiProjection = (tabs: readonly PageTab[], activeId: string): PageTabsUiState => ({
	tabs: tabs.map(({ id, title, customTitle }) => ({ id, title: customTitle ?? title })),
	activeId,
});

export const createPageTabsStore = (options: CreatePageTabsStoreOptions) => {
	const createId = options.createId ?? (() => crypto.randomUUID());
	const initial = tab(createId(), options.initialPage);

	return create<PageTabsState>()(
		persist(
			(set) => ({
				tabs: [initial],
				activeId: initial.id,
				closedTabs: [],
				addTab: (page) => {
					const next = tab(createId(), page);
					set((state) => ({ tabs: [...state.tabs, next], activeId: next.id }));
					return next.id;
				},
				selectTab: (activeId) => set({ activeId }),
				selectAdjacentTab: (offset) =>
					set((state) => {
						const index = state.tabs.findIndex((item) => item.id === state.activeId);
						return { activeId: state.tabs[(index + offset + state.tabs.length) % state.tabs.length]!.id };
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
						const index = beforeId === null ? tabs.length : tabs.findIndex((item) => item.id === beforeId);
						tabs.splice(index, 0, moving);
						return { tabs };
					}),
				closeTab: (id) =>
					set((state) => {
						const index = state.tabs.findIndex((item) => item.id === id);
						const closed = state.tabs[index]!;
						const replacement = state.tabs.length === 1 ? tab(createId(), options.homePage) : null;
						const tabs = replacement ? [replacement] : state.tabs.filter((item) => item.id !== id);
						return {
							tabs,
							activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.activeId,
							closedTabs: [...state.closedTabs, { tab: closed, index, replacementId: replacement?.id ?? null }],
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
						tabs.splice(closed.index, 0, closed.tab);
						return { tabs, activeId: closed.tab.id, closedTabs: state.closedTabs.slice(0, -1) };
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
				partialize: (state) => ({ tabs: state.tabs, activeId: state.activeId, closedTabs: state.closedTabs }),
			},
		),
	);
};
