import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type PageTabPage = {
	url: string;
	title: string;
};

export type PageTab = PageTabPage & {
	id: string;
	backHistory: PageTabPage[];
	forwardHistory: PageTabPage[];
};

export type PageTabItem = Pick<PageTab, "id" | "title">;

export type PageTabsState = {
	tabs: PageTab[];
	activeId: string;
	addTab: (page: PageTabPage) => string;
	selectTab: (id: string) => void;
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
	tabs: tabs.map(({ id, title }) => ({ id, title })),
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
				addTab: (page) => {
					const next = tab(createId(), page);
					set((state) => ({ tabs: [...state.tabs, next], activeId: next.id }));
					return next.id;
				},
				selectTab: (activeId) => set({ activeId }),
				closeTab: (id) =>
					set((state) => {
						if (state.tabs.length === 1) {
							const next = tab(createId(), options.homePage);
							return { tabs: [next], activeId: next.id };
						}

						const index = state.tabs.findIndex((item) => item.id === id);
						const tabs = state.tabs.filter((item) => item.id !== id);
						if (state.activeId !== id) return { tabs };
						return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)]!.id };
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
				partialize: (state) => ({ tabs: state.tabs, activeId: state.activeId }),
			},
		),
	);
};
