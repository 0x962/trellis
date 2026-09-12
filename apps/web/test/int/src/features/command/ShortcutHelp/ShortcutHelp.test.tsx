import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../media";
import { asPlatform, press, renderShell, resetStores } from "../../../../../palette";
import { formatShortcut, shortcuts } from "../../../../../../src/lib/shortcuts";

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

	// SH-03, CK-3. Every key of the map is on the sheet, so the sheet can
	// never fall behind the map. One action is one row, with every key that
	// runs it.
	test("the help sheet shows one row per action with every key of the map", async () => {
		asPlatform("mac");
		await renderShell();
		await openHelp();
		expect(shortcuts.length).toBeGreaterThan(30);
		const actions = new Set(shortcuts.map((shortcut) => `${shortcut.scope} ${shortcut.label}`));
		const rows = within(sheet()).getAllByRole("listitem");
		expect(rows).toHaveLength(actions.size);
		for (const shortcut of shortcuts) {
			const row = rows.find((item) => item.getAttribute("data-action") === `${shortcut.scope} ${shortcut.label}`)!;
			expect(row, shortcut.id).toBeDefined();
			const caps = [...row.querySelectorAll("kbd")].map((kbd) => kbd.textContent);
			for (const cap of formatShortcut(shortcut.keys, "mac")) expect(caps, shortcut.id).toContain(cap);
		}
	});

	// CK-3. Two keys for one action read as "j or ↓", with a faint "or".
	test("an action with two keys shows both, joined by a faint or", async () => {
		asPlatform("mac");
		await renderShell();
		await openHelp();
		const row = within(sheet()).getByRole("listitem", { name: /Move to the row below/ });
		expect([...row.querySelectorAll("kbd")].map((kbd) => kbd.textContent)).toEqual(["j", "↓"]);
		const or = within(row).getByText("or");
		for (const name of ["text-xs", "text-fg-faint"]) expect(or.classList.contains(name)).toBe(true);
		expect(row.className).toMatch(/\bh-8\b/);
	});

	// SH-04, CK-3. The sections follow the map order, with overline headers.
	test("the help sheet groups the rows in map order under overline headers", async () => {
		await renderShell();
		await openHelp();
		const groups = within(sheet())
			.getAllByRole("region")
			.map((region) => region.getAttribute("aria-label"));
		expect(groups).toEqual(["Global", "List", "Board", "Ticket", "New ticket"]);
		const header = within(sheet()).getByRole("heading", { name: "Global" });
		for (const name of ["text-xs", "font-medium", "uppercase", "text-fg-faint"]) {
			expect(header.classList.contains(name)).toBe(true);
		}
	});

	// CK-3. The title is sans, the sheet is 400 px, and the search field
	// takes the first focus, so a mouse open draws no ring on the close
	// button. Typing filters the rows.
	test("the search field takes the first focus and filters the rows", async () => {
		await renderShell();
		const panel = await openHelp();
		expect(panel.style.width).toBe("400px");
		const title = within(panel).getByRole("heading", { name: "Keyboard shortcuts" });
		for (const name of ["text-md", "font-semibold"]) expect(title.classList.contains(name)).toBe(true);
		expect(title.classList.contains("font-mono")).toBe(false);
		const field = within(panel).getByRole("searchbox", { name: "Search the shortcuts" });
		expect(field.className).toMatch(/\bh-8\b/);
		await waitFor(() => expect(document.activeElement).toBe(field));
		await userEvent.setup().type(field, "theme");
		const rows = within(panel).getAllByRole("listitem");
		expect(rows.map((row) => row.getAttribute("data-action"))).toEqual(["global Switch between dark and light"]);
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
		input.remove();
		expect(await openHelp()).toBeDefined();
	});
});
