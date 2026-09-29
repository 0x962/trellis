import { expect, test } from "bun:test";
import {
	saveSessionStatusPaneVisible,
	sessionStatusPaneStorageKey,
	sessionStatusPaneVisible,
} from "./statusPanePreference";

test("preserves the local status pane choice", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	};

	expect(sessionStatusPaneVisible(storage)).toBe(true);
	saveSessionStatusPaneVisible(storage, false);
	expect(values.get(sessionStatusPaneStorageKey)).toBe("hidden");
	expect(sessionStatusPaneVisible(storage)).toBe(false);
	saveSessionStatusPaneVisible(storage, true);
	expect(sessionStatusPaneVisible(storage)).toBe(true);
});
