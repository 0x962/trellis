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

test("the More state of a project starts shut and persists by project id", () => {
	const entries = new Map<string, string>();
	globalThis.localStorage = memoryStorage(entries);
	const store = createUiStore();

	expect(store.getState().expandedProjectMore).toEqual({});
	store.getState().toggleProjectMore("project-1");

	expect(store.getState().expandedProjectMore).toEqual({ "project-1": true });
	expect(JSON.parse(entries.get(uiStorageKey) ?? "{}").state.expandedProjectMore).toEqual({ "project-1": true });
	expect(createUiStore().getState().expandedProjectMore).toEqual({ "project-1": true });
});
