import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";

export const uiStorageKey = "trellis-ui";

// The persisted values.
export type UiData = {
	sidebarCollapsed: boolean;
	density: Density;
	// The collapsed group names per route: `{"/p/CDE": ["done"]}`.
	collapsedGroups: Record<string, string[]>;
	// A project row is expanded unless this holds `false` for its id.
	expandedProjects: Record<string, boolean>;
};

export type UiState = UiData & {
	toggleSidebar: () => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	setDensity: (density: Density) => void;
	toggleProject: (id: string) => void;
	toggleGroup: (route: string, group: string) => void;
	setGroupCollapsed: (route: string, group: string, collapsed: boolean) => void;
};

const defaults: UiData = {
	sidebarCollapsed: false,
	density: "comfortable",
	collapsedGroups: {},
	expandedProjects: {},
};

// Every change as a pure function of the data. A store action and the
// matching entry of `uiActions` run the same function, so a test that
// replaces the store's state with another instance's state still changes
// `useUiStore` when a component calls `uiActions`.
const updates = {
	toggleSidebar: (state: UiData): Partial<UiData> => ({ sidebarCollapsed: !state.sidebarCollapsed }),
	setSidebarCollapsed: (sidebarCollapsed: boolean) => (): Partial<UiData> => ({ sidebarCollapsed }),
	setDensity: (density: Density) => (): Partial<UiData> => ({ density }),
	toggleProject:
		(id: string) =>
		(state: UiData): Partial<UiData> => ({
			expandedProjects: { ...state.expandedProjects, [id]: !(state.expandedProjects[id] ?? true) },
		}),
	toggleGroup:
		(route: string, group: string) =>
		(state: UiData): Partial<UiData> => {
			const groups = state.collapsedGroups[route] ?? [];
			const next = groups.includes(group) ? groups.filter((name) => name !== group) : [...groups, group];
			return { collapsedGroups: { ...state.collapsedGroups, [route]: next } };
		},
	setGroupCollapsed:
		(route: string, group: string, collapsed: boolean) =>
		(state: UiData): Partial<UiData> => {
			const groups = state.collapsedGroups[route] ?? [];
			const next = collapsed ? [...new Set([...groups, group])] : groups.filter((name) => name !== group);
			return { collapsedGroups: { ...state.collapsedGroups, [route]: next } };
		},
};

// The renderer-local preferences: the sidebar, the density, the collapsed
// groups, and the tree expansion. Every change writes through to
// localStorage, and a new store reads the stored state at creation.
export const createUiStore = () =>
	create<UiState>()(
		persist(
			(set) => ({
				...defaults,
				toggleSidebar: () => set(updates.toggleSidebar),
				setSidebarCollapsed: (collapsed) => set(updates.setSidebarCollapsed(collapsed)),
				setDensity: (density) => set(updates.setDensity(density)),
				toggleProject: (id) => set(updates.toggleProject(id)),
				toggleGroup: (route, group) => set(updates.toggleGroup(route, group)),
				setGroupCollapsed: (route, group, collapsed) => set(updates.setGroupCollapsed(route, group, collapsed)),
			}),
			{
				name: uiStorageKey,
				storage: createJSONStorage(() => localStorage),
				partialize: (state) => ({
					sidebarCollapsed: state.sidebarCollapsed,
					density: state.density,
					collapsedGroups: state.collapsedGroups,
					expandedProjects: state.expandedProjects,
				}),
			},
		),
	);

export const useUiStore = createUiStore();

// The actions components call. Each one changes `useUiStore` itself.
export const uiActions = {
	toggleSidebar: () => useUiStore.setState(updates.toggleSidebar),
	setSidebarCollapsed: (collapsed: boolean) => useUiStore.setState(updates.setSidebarCollapsed(collapsed)),
	setDensity: (density: Density) => useUiStore.setState(updates.setDensity(density)),
	toggleProject: (id: string) => useUiStore.setState(updates.toggleProject(id)),
	toggleGroup: (route: string, group: string) => useUiStore.setState(updates.toggleGroup(route, group)),
	setGroupCollapsed: (route: string, group: string, collapsed: boolean) =>
		useUiStore.setState(updates.setGroupCollapsed(route, group, collapsed)),
};
