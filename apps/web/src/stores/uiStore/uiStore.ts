import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";

export const uiStorageKey = "trellis-ui";

// The persisted values.
export type UiData = {
	sidebarCollapsed: boolean;
	density: Density;
	// The collapsed group names per route: `{"/p/CDE": ["done"]}`. A route
	// with no entry collapses its Done and Canceled groups.
	collapsedGroups: Record<string, string[]>;
	// The done or canceled ticket rows that show their child rows, by route.
	expandedTickets: Record<string, string[]>;
	// A project row is expanded unless this holds `false` for its id.
	expandedProjects: Record<string, boolean>;
	// The More row under a project shows the pages it holds only when this
	// holds `true` for the project id.
	expandedProjectMore: Record<string, boolean>;
	// The table columns a route hides or shows: `{"/p/CDE": {updated: false}}`.
	columnVisibility: Record<string, Record<string, boolean>>;
};

export type UiState = UiData & {
	// The sidebar sheet on a phone. It is never stored, so a reload opens
	// the page with the sheet closed.
	mobileSidebarOpen: boolean;
	setMobileSidebarOpen: (open: boolean) => void;
	toggleSidebar: () => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	setDensity: (density: Density) => void;
	toggleProject: (id: string) => void;
	toggleProjectMore: (id: string) => void;
	// `defaults` names the groups a route collapses before its first toggle.
	toggleGroup: (route: string, group: string, defaults?: string[]) => void;
	toggleTicketExpanded: (route: string, ticketId: string) => void;
	setColumnVisible: (route: string, column: string, visible: boolean) => void;
	setGroupCollapsed: (route: string, group: string, collapsed: boolean) => void;
};

const defaults: UiData = {
	sidebarCollapsed: false,
	density: "comfortable",
	collapsedGroups: {},
	expandedTickets: {},
	expandedProjects: {},
	expandedProjectMore: {},
	columnVisibility: {},
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
	toggleProjectMore:
		(id: string) =>
		(state: UiData): Partial<UiData> => ({
			expandedProjectMore: { ...state.expandedProjectMore, [id]: !(state.expandedProjectMore[id] ?? false) },
		}),
	toggleGroup:
		(route: string, group: string, defaults: string[] = []) =>
		(state: UiData): Partial<UiData> => {
			const groups = state.collapsedGroups[route] ?? defaults;
			const next = groups.includes(group) ? groups.filter((name) => name !== group) : [...groups, group];
			return { collapsedGroups: { ...state.collapsedGroups, [route]: next } };
		},
	toggleTicketExpanded:
		(route: string, ticketId: string) =>
		(state: UiData): Partial<UiData> => {
			const tickets = state.expandedTickets[route] ?? [];
			const next = tickets.includes(ticketId) ? tickets.filter((id) => id !== ticketId) : [...tickets, ticketId];
			return { expandedTickets: { ...state.expandedTickets, [route]: next } };
		},
	setColumnVisible:
		(route: string, column: string, visible: boolean) =>
		(state: UiData): Partial<UiData> => ({
			columnVisibility: {
				...state.columnVisibility,
				[route]: { ...state.columnVisibility[route], [column]: visible },
			},
		}),
	setGroupCollapsed:
		(route: string, group: string, collapsed: boolean) =>
		(state: UiData): Partial<UiData> => {
			const groups = state.collapsedGroups[route] ?? [];
			const next = collapsed ? [...new Set([...groups, group])] : groups.filter((name) => name !== group);
			return { collapsedGroups: { ...state.collapsedGroups, [route]: next } };
		},
};

const browserStorage = {
	getItem: (name: string) => {
		try {
			return globalThis.localStorage?.getItem(name) ?? null;
		} catch {
			return null;
		}
	},
	setItem: (name: string, value: string) => {
		try {
			globalThis.localStorage?.setItem(name, value);
		} catch {
			return;
		}
	},
	removeItem: (name: string) => {
		try {
			globalThis.localStorage?.removeItem(name);
		} catch {
			return;
		}
	},
};

// The renderer-local preferences: the sidebar, density, table expansion,
// project tree expansion, and visible columns. Every change writes to
// browser storage when the browser permits it. A new store reads the stored
// state at creation.
export const createUiStore = () =>
	create<UiState>()(
		persist(
			(set) => ({
				...defaults,
				mobileSidebarOpen: false,
				setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
				toggleSidebar: () => set(updates.toggleSidebar),
				setSidebarCollapsed: (collapsed) => set(updates.setSidebarCollapsed(collapsed)),
				setDensity: (density) => set(updates.setDensity(density)),
				toggleProject: (id) => set(updates.toggleProject(id)),
				toggleProjectMore: (id) => set(updates.toggleProjectMore(id)),
				toggleGroup: (route, group, defaults) => set(updates.toggleGroup(route, group, defaults)),
				toggleTicketExpanded: (route, ticketId) => set(updates.toggleTicketExpanded(route, ticketId)),
				setColumnVisible: (route, column, visible) => set(updates.setColumnVisible(route, column, visible)),
				setGroupCollapsed: (route, group, collapsed) => set(updates.setGroupCollapsed(route, group, collapsed)),
			}),
			{
				name: uiStorageKey,
				storage: createJSONStorage(() => browserStorage),
				partialize: (state) => ({
					sidebarCollapsed: state.sidebarCollapsed,
					density: state.density,
					collapsedGroups: state.collapsedGroups,
					expandedTickets: state.expandedTickets,
					expandedProjects: state.expandedProjects,
					expandedProjectMore: state.expandedProjectMore,
					columnVisibility: state.columnVisibility,
				}),
			},
		),
	);

export const useUiStore = createUiStore();

// The actions components call. Each one changes `useUiStore` itself.
export const uiActions = {
	setMobileSidebarOpen: (open: boolean) => useUiStore.setState({ mobileSidebarOpen: open }),
	toggleSidebar: () => useUiStore.setState(updates.toggleSidebar),
	setSidebarCollapsed: (collapsed: boolean) => useUiStore.setState(updates.setSidebarCollapsed(collapsed)),
	setDensity: (density: Density) => useUiStore.setState(updates.setDensity(density)),
	toggleProject: (id: string) => useUiStore.setState(updates.toggleProject(id)),
	toggleProjectMore: (id: string) => useUiStore.setState(updates.toggleProjectMore(id)),
	toggleGroup: (route: string, group: string, defaults?: string[]) =>
		useUiStore.setState(updates.toggleGroup(route, group, defaults)),
	toggleTicketExpanded: (route: string, ticketId: string) =>
		useUiStore.setState(updates.toggleTicketExpanded(route, ticketId)),
	setColumnVisible: (route: string, column: string, visible: boolean) =>
		useUiStore.setState(updates.setColumnVisible(route, column, visible)),
	setGroupCollapsed: (route: string, group: string, collapsed: boolean) =>
		useUiStore.setState(updates.setGroupCollapsed(route, group, collapsed)),
};
