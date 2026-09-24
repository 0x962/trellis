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
	// The table columns a route hides or shows: `{"/p/CDE": {updated: false}}`.
	columnVisibility: Record<string, Record<string, boolean>>;
};

// The values that live for as long as the page does. Nothing writes them to
// browser storage, so a reload starts each one at its default.
export type UiRuntime = {
	// The sidebar sheet on a phone.
	mobileSidebarOpen: boolean;
	// The page that each open More row was opened on, by project id. A project
	// with no entry holds More shut. Two rules keep an arrival at a project
	// page shut. The page in this record must equal the page on screen, which
	// draws the first frame of a navigation shut. `setShownPage` then empties
	// the record, which shuts a return to the page where the person pressed
	// More.
	projectMorePath: Record<string, string>;
	// The page that the sidebar draws now. The sidebar reports each page it
	// draws, and a page that differs from this one empties `projectMorePath`.
	shownPage: string;
};

export type UiState = UiData &
	UiRuntime & {
		setMobileSidebarOpen: (open: boolean) => void;
		toggleSidebar: () => void;
		setSidebarCollapsed: (collapsed: boolean) => void;
		setDensity: (density: Density) => void;
		toggleProject: (id: string) => void;
		// `pathname` is the page on screen at the press.
		toggleProjectMore: (id: string, pathname: string) => void;
		// Reports the page that the sidebar draws now. A page that differs from
		// the stored one shuts the More row of every project.
		setShownPage: (pathname: string) => void;
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
	columnVisibility: {},
};

const runtimeDefaults: UiRuntime = {
	mobileSidebarOpen: false,
	projectMorePath: {},
	shownPage: "",
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
		(id: string, pathname: string) =>
		(state: UiRuntime): Partial<UiRuntime> => {
			const paths = { ...state.projectMorePath };
			if (paths[id] === pathname) delete paths[id];
			else paths[id] = pathname;
			return { projectMorePath: paths };
		},
	setShownPage:
		(pathname: string) =>
		(state: UiRuntime): Partial<UiRuntime> =>
			state.shownPage === pathname ? {} : { shownPage: pathname, projectMorePath: {} },
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
// project expansion, and visible columns. Every change writes to
// browser storage when the browser permits it. A new store reads the stored
// state at creation.
export const createUiStore = () =>
	create<UiState>()(
		persist(
			(set) => ({
				...defaults,
				...runtimeDefaults,
				setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
				toggleSidebar: () => set(updates.toggleSidebar),
				setSidebarCollapsed: (collapsed) => set(updates.setSidebarCollapsed(collapsed)),
				setDensity: (density) => set(updates.setDensity(density)),
				toggleProject: (id) => set(updates.toggleProject(id)),
				toggleProjectMore: (id, pathname) => set(updates.toggleProjectMore(id, pathname)),
				setShownPage: (pathname) => set(updates.setShownPage(pathname)),
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
	toggleProjectMore: (id: string, pathname: string) => useUiStore.setState(updates.toggleProjectMore(id, pathname)),
	setShownPage: (pathname: string) => useUiStore.setState(updates.setShownPage(pathname)),
	toggleGroup: (route: string, group: string, defaults?: string[]) =>
		useUiStore.setState(updates.toggleGroup(route, group, defaults)),
	toggleTicketExpanded: (route: string, ticketId: string) =>
		useUiStore.setState(updates.toggleTicketExpanded(route, ticketId)),
	setColumnVisible: (route: string, column: string, visible: boolean) =>
		useUiStore.setState(updates.setColumnVisible(route, column, visible)),
	setGroupCollapsed: (route: string, group: string, collapsed: boolean) =>
		useUiStore.setState(updates.setGroupCollapsed(route, group, collapsed)),
};
