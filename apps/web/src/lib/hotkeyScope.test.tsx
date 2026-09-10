import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { themeStorageKey } from "@trellis/ui";
import { createFakeScheduler } from "../../test/fakeScheduler";
import { mockMatchMedia } from "../../test/media";
import { createUiStore, useUiStore } from "../stores/uiStore";
import { HotkeyScope } from "./hotkeyScope";

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
	fireEvent.keyDown(target, { key, ...init });

const mount = (pathname = "/needs-you") => {
	const navigate = mock((_to: string) => {});
	const onProjectPicker = mock(() => {});
	const onHelp = mock(() => {});
	const clock = createFakeScheduler();
	const view = render(
		<HotkeyScope
			navigate={navigate}
			pathname={pathname}
			onProjectPicker={onProjectPicker}
			onHelp={onHelp}
			scheduler={clock.scheduler}
		/>,
	);
	const rerender = (next: string) =>
		view.rerender(
			<HotkeyScope
				navigate={navigate}
				pathname={next}
				onProjectPicker={onProjectPicker}
				onHelp={onHelp}
				scheduler={clock.scheduler}
			/>,
		);
	return { navigate, onProjectPicker, onHelp, ...clock, rerender };
};

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
	useUiStore.setState(createUiStore().getState());
});

describe("lib/hotkeyScope", () => {
	// WS-25
	test("g h navigates to Needs you", () => {
		const { navigate } = mount();
		press("g");
		press("h");
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledWith("/needs-you");
	});

	// WS-26. `g s` focuses the filter bar of the current list when the page
	// renders one.
	test("g a, g p, and g s dispatch their sequence actions", () => {
		const { navigate, onProjectPicker } = mount();
		const bar = document.createElement("div");
		bar.setAttribute("data-filter-bar", "");
		bar.tabIndex = -1;
		document.body.appendChild(bar);
		press("g");
		press("a");
		expect(navigate).toHaveBeenCalledWith("/all");
		press("g");
		press("p");
		expect(onProjectPicker).toHaveBeenCalledTimes(1);
		press("g");
		press("s");
		expect(document.activeElement).toBe(bar);
		expect(navigate).toHaveBeenCalledTimes(1);
		bar.remove();
	});

	// WS-27. The view switch exists only under /p, where the table and the
	// board are two URLs of one project.
	test("g b and g t switch the view only on project routes", () => {
		const { navigate, rerender } = mount("/p/CDE");
		press("g");
		press("b");
		expect(navigate).toHaveBeenLastCalledWith("/p/CDE/board");
		rerender("/p/CDE/board");
		press("g");
		press("t");
		expect(navigate).toHaveBeenLastCalledWith("/p/CDE");
		expect(navigate).toHaveBeenCalledTimes(2);
		rerender("/needs-you");
		press("g");
		press("b");
		press("g");
		press("t");
		expect(navigate).toHaveBeenCalledTimes(2);
	});

	// WS-28
	test("a second key after the 800 ms window does not complete the sequence", () => {
		const { navigate, advanceTo } = mount();
		press("g");
		act(() => advanceTo(900));
		press("h");
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.queryByRole("status")).toBeNull();
		press("h");
		expect(navigate).not.toHaveBeenCalled();
	});

	// WS-29. The hint sits bottom-left and reads to a screen reader as a
	// status, so a pending sequence is never invisible.
	test("the g… hint shows while a sequence is pending", () => {
		const { advanceTo } = mount();
		expect(screen.queryByRole("status")).toBeNull();
		press("g");
		const hint = screen.getByRole("status");
		expect(hint.textContent).toBe("g…");
		expect(hint.className).toMatch(/\bfixed\b/);
		expect(hint.className).toMatch(/\bbottom-\d/);
		expect(hint.className).toMatch(/\bleft-\d/);
		press("h");
		expect(screen.queryByRole("status")).toBeNull();
		press("g");
		expect(screen.getByRole("status")).toBeDefined();
		act(() => advanceTo(801));
		expect(screen.queryByRole("status")).toBeNull();
	});

	// WS-30. A letter typed in a text field is text, never a shortcut.
	test("sequences do not fire inside text fields", () => {
		const { navigate } = mount();
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		press("g", {}, input);
		press("h", {}, input);
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.queryByRole("status")).toBeNull();
		input.remove();
	});

	// WS-31
	test("[ toggles the sidebar, mod+\\ toggles the theme, ? opens help", () => {
		const { onHelp } = mount();
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		press("[");
		expect(useUiStore.getState().sidebarCollapsed).toBe(true);
		press("[");
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		press("\\", { metaKey: true });
		expect(localStorage.getItem(themeStorageKey)).toBe("light");
		expect(document.documentElement.getAttribute("data-theme")).toBe("light");
		press("\\", { ctrlKey: true });
		expect(localStorage.getItem(themeStorageKey)).toBe("dark");
		press("?", { shiftKey: true });
		expect(onHelp).toHaveBeenCalledTimes(1);
	});
});
