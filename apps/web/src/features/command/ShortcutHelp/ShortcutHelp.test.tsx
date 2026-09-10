import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import { asPlatform, press, renderShell, resetStores } from "../../../../test/palette";
import { shortcuts } from "../../../lib/shortcuts";

const sheet = () => screen.getByRole("dialog", { name: /Keyboard shortcuts/ });

const openHelp = async () => {
	press("?", { shiftKey: true });
	return await screen.findByRole("dialog", { name: /Keyboard shortcuts/ });
};

beforeEach(() => {
	localStorage.clear();
	document.body.innerHTML = "";
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/ShortcutHelp", () => {
	// SH-01
	test("the question mark opens the help sheet", async () => {
		await renderShell();
		expect(await openHelp()).toBeDefined();
	});

	// SH-02
	test("Escape closes the help sheet and returns the focus", async () => {
		await renderShell();
		const opener = document.createElement("button");
		document.body.appendChild(opener);
		opener.focus();
		await openHelp();
		await userEvent.setup().keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog", { name: /Keyboard shortcuts/ })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(opener));
	});

	// SH-03. Every key of the map is on the sheet, so the sheet can never
	// fall behind the map.
	test("the help sheet lists every shortcut in the map", async () => {
		await renderShell();
		await openHelp();
		expect(shortcuts.length).toBeGreaterThan(30);
		expect(within(sheet()).getAllByRole("listitem")).toHaveLength(shortcuts.length);
	});

	// SH-04
	test("the help sheet groups the rows by scope in map order", async () => {
		await renderShell();
		await openHelp();
		const scopes = [...new Set(shortcuts.map((shortcut) => shortcut.scope))];
		const groups = within(sheet())
			.getAllByRole("region")
			.map((region) => (region.getAttribute("aria-label") ?? "").toLowerCase());
		expect(groups).toEqual(scopes);
	});

	// SH-05
	test("a mod row shows the command symbol on a Mac", async () => {
		asPlatform("mac");
		await renderShell();
		await openHelp();
		const keys = within(sheet())
			.getAllByText("⌘")
			.map((key) => key.tagName);
		expect(keys.length).toBeGreaterThan(0);
		expect(keys[0]).toBe("KBD");
	});

	// SH-06
	test("the help sheet is a named dialog that keeps the focus", async () => {
		await renderShell();
		const panel = await openHelp();
		expect(panel.getAttribute("aria-modal")).toBe("true");
		await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
	});

	// SH-07. A letter is text while a field holds the focus, and a key
	// binding never eats it.
	test("the question mark types into a text field and opens no sheet", async () => {
		await renderShell();
		const user = userEvent.setup();
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		await user.type(input, "?");
		expect(input.value).toBe("?");
		expect(screen.queryByRole("dialog", { name: /Keyboard shortcuts/ })).toBeNull();
		input.blur();
		expect(await openHelp()).toBeDefined();
	});
});
