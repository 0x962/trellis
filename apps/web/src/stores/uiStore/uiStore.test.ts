import { beforeEach, describe, expect, test } from "bun:test";
import { createUiStore, uiStorageKey, useUiStore } from "./uiStore";

const cdeId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

describe("stores/uiStore", () => {
	// WS-61. A project row is expanded unless `expandedProjects` holds
	// `false` for its id.
	test("uiStore defaults and persist key", () => {
		const store = createUiStore();
		const state = store.getState();
		expect(state.sidebarCollapsed).toBe(false);
		expect(state.density).toBe("comfortable");
		expect(state.collapsedGroups).toEqual({});
		expect(state.expandedProjects).toEqual({});
		expect(uiStorageKey).toBe("trellis-ui");
		expect(useUiStore.persist.getOptions().name).toBe("trellis-ui");
	});

	// WS-62. The store writes through to localStorage on every change and a
	// new instance reads the stored state at creation.
	test("sidebar, density, expansion, and group state persist across store instances", () => {
		const store = createUiStore();
		store.getState().toggleSidebar();
		store.getState().setDensity("compact");
		store.getState().toggleProject(cdeId);
		store.getState().toggleGroup("/p/CDE", "done");
		const raw = localStorage.getItem("trellis-ui");
		expect(raw).toBeString();
		const persisted = JSON.parse(raw!) as { state: Record<string, unknown> };
		expect(persisted.state.sidebarCollapsed).toBe(true);
		expect(persisted.state.density).toBe("compact");
		expect(persisted.state.expandedProjects).toEqual({ [cdeId]: false });
		expect(persisted.state.collapsedGroups).toEqual({ "/p/CDE": ["done"] });
		const fresh = createUiStore();
		expect(fresh.getState().sidebarCollapsed).toBe(true);
		expect(fresh.getState().density).toBe("compact");
		expect(fresh.getState().expandedProjects).toEqual({ [cdeId]: false });
		expect(fresh.getState().collapsedGroups).toEqual({ "/p/CDE": ["done"] });
		fresh.getState().toggleGroup("/p/CDE", "done");
		expect(fresh.getState().collapsedGroups).toEqual({ "/p/CDE": [] });
		fresh.getState().toggleProject(cdeId);
		expect(fresh.getState().expandedProjects).toEqual({ [cdeId]: true });
	});
});
