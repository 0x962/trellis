import { afterEach, expect, test } from "bun:test";
import { createUiStore, uiStorageKey } from "../../stores/uiStore";

const hadLocalStorage = "localStorage" in globalThis;
const originalLocalStorage = globalThis.localStorage;

const memoryStorage = (entries: Map<string, string>): Storage => ({
	get length() {
		return entries.size;
	},
	clear: () => entries.clear(),
	getItem: (key) => entries.get(key) ?? null,
	key: (index) => [...entries.keys()][index] ?? null,
	removeItem: (key) => entries.delete(key),
	setItem: (key, value) => entries.set(key, value),
});

afterEach(() => {
	if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
	else Reflect.deleteProperty(globalThis, "localStorage");
});

test("project collapse state persists by project id", () => {
	const entries = new Map<string, string>();
	globalThis.localStorage = memoryStorage(entries);
	const store = createUiStore();

	store.getState().toggleProject("project-1");

	expect(store.getState().expandedProjects).toEqual({ "project-1": false });
	expect(JSON.parse(entries.get(uiStorageKey) ?? "{}").state.expandedProjects).toEqual({ "project-1": false });
	expect(createUiStore().getState().expandedProjects).toEqual({ "project-1": false });
});

test("project collapse state works without localStorage", () => {
	Reflect.deleteProperty(globalThis, "localStorage");
	const store = createUiStore();

	store.getState().toggleProject("project-1");

	expect(store.getState().expandedProjects).toEqual({ "project-1": false });
});

test("the More row of a project starts shut and opens on the page of the press", () => {
	const store = createUiStore();

	expect(store.getState().projectMorePath).toEqual({});
	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");

	expect(store.getState().projectMorePath).toEqual({ "project-1": "/p/TRL/epics" });
});

test("a second press on the same page shuts the More row again", () => {
	const store = createUiStore();

	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");
	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");

	expect(store.getState().projectMorePath).toEqual({});
});

test("a press on one project leaves the More row of another project shut", () => {
	const store = createUiStore();

	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");
	store.getState().toggleProjectMore("project-2", "/p/CDE/epics");

	expect(store.getState().projectMorePath).toEqual({ "project-1": "/p/TRL/epics", "project-2": "/p/CDE/epics" });
});

test("no browser storage holds the open More row, so a reload shuts it", () => {
	const entries = new Map<string, string>();
	globalThis.localStorage = memoryStorage(entries);
	const store = createUiStore();

	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");

	expect(JSON.parse(entries.get(uiStorageKey) ?? "{}").state.projectMorePath).toBeUndefined();
	expect(createUiStore().getState().projectMorePath).toEqual({});
});
