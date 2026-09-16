import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import { themeStorageKey } from "@trellis/ui";
import { createFakeScheduler } from "../../test/fakeScheduler";
import {
	focusedField,
	globalRows,
	mountEscapeStack,
	mountScope,
	mountTarget,
	press,
	pressKeys,
	scopedRows,
	trackListeners,
} from "../../test/hotkeys";
import { mockMatchMedia } from "../../test/media";
import { createUiStore, useUiStore } from "../stores/uiStore";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.body.innerHTML = "";
	mockMatchMedia(false);
	useUiStore.setState(createUiStore().getState());
});

describe("lib/hotkeys", () => {
	// HK-01
	test("Cmd+K runs the palette handler once per press", () => {
		const { onPalette } = mountScope();
		press("k", { metaKey: true });
		expect(onPalette).toHaveBeenCalledTimes(1);
		press("k", { ctrlKey: true });
		expect(onPalette).toHaveBeenCalledTimes(2);
	});

	// HK-02
	test("slash runs the search mode handler", () => {
		const { onSearch, onPalette } = mountScope();
		press("/");
		expect(onSearch).toHaveBeenCalledTimes(1);
		expect(onPalette).not.toHaveBeenCalled();
	});

	// HK-03
	test("c opens the composer and cancels the key's default text entry", () => {
		const { onCompose } = mountScope();
		expect(press("c")).toBe(false);
		expect(onCompose).toHaveBeenCalledTimes(1);
	});

	// HK-04
	test("the question mark runs no global handler", () => {
		const scope = mountScope();
		press("?", { shiftKey: true });
		expect(scope.navigate).not.toHaveBeenCalled();
		expect(scope.onPalette).not.toHaveBeenCalled();
		expect(scope.onSearch).not.toHaveBeenCalled();
		expect(scope.onCompose).not.toHaveBeenCalled();
		expect(scope.onProjectPicker).not.toHaveBeenCalled();
	});

	// HK-05
	test("the left bracket toggles the sidebar", () => {
		mountScope();
		press("[");
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		press("[");
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
	});

	// HK-06
	test("Cmd+backslash toggles the theme", () => {
		mountScope();
		press("\\", { metaKey: true });
		expect(localStorage.getItem(themeStorageKey)).toBe("light");
		expect(document.documentElement.getAttribute("data-theme")).toBe("light");
		press("\\", { ctrlKey: true });
		expect(localStorage.getItem(themeStorageKey)).toBe("dark");
	});

	// HK-07. A letter is text in a field; a mod chord is never text.
	test("a letter key stays idle in a text field while a mod chord fires", () => {
		const { onCompose, onPalette } = mountScope();
		const input = focusedField();
		press("c", {}, input);
		expect(onCompose).not.toHaveBeenCalled();
		press("k", { metaKey: true }, input);
		expect(onPalette).toHaveBeenCalledTimes(1);
		input.remove();
	});

	// HK-08
	test("g then h goes to Needs you", () => {
		const { navigate } = mountScope();
		press("g");
		press("h");
		expect(navigate.mock.calls).toEqual([["/needs-you"]]);
	});

	// HK-09
	test("g then a goes to All tickets", () => {
		const { navigate } = mountScope();
		press("g");
		press("a");
		expect(navigate.mock.calls).toEqual([["/all"]]);
	});

	// HK-10
	test("g then p opens the project picker", () => {
		const { onProjectPicker } = mountScope();
		press("g");
		press("p");
		expect(onProjectPicker).toHaveBeenCalledTimes(1);
	});

	// HK-11
	test("g then b and g then t switch the project view", () => {
		const { navigate, rerender } = mountScope("/p/CDE/table");
		press("g");
		press("b");
		expect(navigate).toHaveBeenLastCalledWith("/p/CDE");
		rerender("/p/CDE");
		press("g");
		press("t");
		expect(navigate).toHaveBeenLastCalledWith("/p/CDE/table");
		expect(navigate).toHaveBeenCalledTimes(2);
	});

	// HK-12
	test("the view sequences do nothing off a project route", () => {
		const { navigate, rerender } = mountScope("/p/CDE");
		press("g");
		press("b");
		expect(navigate).toHaveBeenCalledTimes(1);
		rerender("/needs-you");
		press("g");
		press("b");
		press("g");
		press("t");
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	// HK-13
	test("g then s focuses the filter bar", () => {
		mountScope();
		const bar = document.createElement("div");
		bar.setAttribute("data-filter-bar", "");
		bar.tabIndex = -1;
		document.body.appendChild(bar);
		press("g");
		press("s");
		expect(document.activeElement).toBe(bar);
	});

	// HK-14. A pending sequence reads to a screen reader as a status.
	test("g shows the sequence hint", () => {
		mountScope();
		expect(screen.queryByRole("status")).toBeNull();
		press("g");
		expect(screen.getByRole("status").textContent).toContain("g");
	});

	// HK-15
	test("the sequence hint clears after the 800 ms window", () => {
		const clock = createFakeScheduler();
		const { navigate } = mountScope("/needs-you", clock.scheduler);
		press("g");
		expect(screen.getByRole("status")).toBeDefined();
		act(() => clock.advanceTo(801));
		expect(screen.queryByRole("status")).toBeNull();
		press("h");
		expect(navigate).not.toHaveBeenCalled();
	});

	// HK-16
	test("an unmapped second key drops the sequence", () => {
		const { navigate } = mountScope();
		press("g");
		expect(screen.getByRole("status")).toBeDefined();
		press("q");
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.queryByRole("status")).toBeNull();
	});

	// HK-17
	test("a second key after the window does nothing", () => {
		const clock = createFakeScheduler();
		const { navigate } = mountScope("/needs-you", clock.scheduler);
		press("g");
		expect(screen.getByRole("status")).toBeDefined();
		act(() => clock.advanceTo(900));
		press("h");
		expect(navigate).not.toHaveBeenCalled();
	});

	// HK-18. The second key of a sequence is read before the page sees it.
	test("the second key of a sequence never reaches a page binding", () => {
		const { navigate } = mountScope("/p/CDE");
		const list = mountTarget("list", ["b"]);
		press("g");
		press("b");
		expect(navigate).toHaveBeenLastCalledWith("/p/CDE");
		expect(list.spies.b).not.toHaveBeenCalled();
	});

	// HK-19
	test("the row keys reach the registered list target", () => {
		mountScope();
		const keys = ["j", "k", "o", "x", "s", "p", "m", "backspace"];
		const list = mountTarget("list", keys);
		for (const key of keys) pressKeys(key);
		for (const key of keys) expect(list.spies[key], key).toHaveBeenCalledTimes(1);
	});

	test("o does not reach a list target from a text entry", () => {
		mountScope();
		const list = mountTarget("list", ["o"]);
		const input = document.createElement("input");
		const textarea = document.createElement("textarea");
		const contenteditable = document.createElement("div");
		contenteditable.contentEditable = "true";
		const textbox = document.createElement("div");
		textbox.setAttribute("role", "textbox");
		for (const target of [input, textarea, contenteditable, textbox]) {
			document.body.appendChild(target);
			press("o", {}, target);
		}

		expect(list.spies.o).not.toHaveBeenCalled();
	});

	// HK-20
	test("the ticket keys reach the registered ticket target", () => {
		mountScope();
		const keys = ["e", "shift+c", "a", "r", "mod+c", "mod+shift+c", "mod+.", "mod+shift+a", "mod+shift+b"];
		const ticket = mountTarget("ticket", keys);
		for (const key of keys) pressKeys(key);
		for (const key of keys) expect(ticket.spies[key], key).toHaveBeenCalledTimes(1);
	});

	// HK-21
	test("the innermost target receives a delegated key", () => {
		mountScope();
		const list = mountTarget("list", ["j"]);
		const ticket = mountTarget("ticket", ["j"]);
		press("j");
		expect(ticket.spies.j).toHaveBeenCalledTimes(1);
		expect(list.spies.j).not.toHaveBeenCalled();
	});

	// HK-22
	test("an unmounted target stops receiving delegated keys", () => {
		mountScope();
		const list = mountTarget("list", ["j"]);
		press("j");
		expect(list.spies.j).toHaveBeenCalledTimes(1);
		list.unmount();
		press("j");
		expect(list.spies.j).toHaveBeenCalledTimes(1);
	});

	// HK-23
	test("a delegated key without a target does nothing", () => {
		const { navigate } = mountScope();
		press("j");
		press("x");
		press("Backspace");
		expect(navigate).not.toHaveBeenCalled();
		const list = mountTarget("list", ["j"]);
		press("j");
		expect(list.spies.j).toHaveBeenCalledTimes(1);
	});

	// HK-24
	test("Escape closes the popover, then the selection", () => {
		mountScope();
		const log = mountEscapeStack();
		press("Escape");
		press("Escape");
		press("Escape");
		expect(log).toEqual(["popover", "selection"]);
	});

	// HK-25. A key bound twice would run its action twice.
	test("every global shortcut is registered exactly once", () => {
		const tracked = trackListeners();
		const scope = mountScope();
		tracked.restore();
		expect(tracked.counts.added).toBeGreaterThan(0);
		expect(tracked.counts.added).toBeLessThanOrEqual(globalRows().length);
		press("k", { metaKey: true });
		press("/");
		press("c");
		expect(scope.onPalette).toHaveBeenCalledTimes(1);
		expect(scope.onSearch).toHaveBeenCalledTimes(1);
		expect(scope.onCompose).toHaveBeenCalledTimes(1);
	});

	// HK-26
	test("the scoped rows stay with the targets and never fire globally", () => {
		const { navigate } = mountScope("/p/CDE");
		const rows = scopedRows();
		expect(rows.length).toBeGreaterThan(20);
		const before = useUiStore.getState();
		for (const row of rows) pressKeys(row.keys);
		expect(navigate).not.toHaveBeenCalled();
		expect(useUiStore.getState()).toEqual(before);
	});

	// HK-27
	test("the hotkey scope removes its listeners on unmount", () => {
		const tracked = trackListeners();
		const scope = mountScope();
		scope.unmount();
		tracked.restore();
		expect(tracked.counts.added).toBeGreaterThan(0);
		expect(tracked.counts.removed).toBe(tracked.counts.added);
	});
});
