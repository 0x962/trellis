import { fireEvent, screen, within } from "@testing-library/react";
import type { Scheduler } from "@trellis/api";
import { useCommandStore } from "../src/features/command/commandStore";
import { useShortcutHelpStore } from "../src/features/command/ShortcutHelp";
import { useComposerStore } from "../src/features/composer";
import { createUiStore, useUiStore } from "../src/stores/uiStore";
import { renderApp } from "./renderWithProviders";
import type { TestServer } from "./server/index.ts";

export type ShellOptions = {
	// The URL the app starts at. The project table by default.
	path?: string;
	server?: TestServer;
	scheduler?: Scheduler;
};

// Every store the palette reads back to its first values. One document
// serves every test in a file, so a leftover value would answer the next
// test.
export const resetStores = () => {
	useCommandStore.setState({
		open: false,
		mode: "commands",
		pathname: "",
		focusedTicket: null,
		peekTicket: null,
		selection: [],
	});
	useComposerStore.setState({ open: false, options: {} });
	useShortcutHelpStore.setState({ open: false });
	useUiStore.setState(createUiStore().getState());
};

// Renders the whole app over the seeded server with an identity, and
// waits for the shell to paint.
export const renderShell = async (options: ShellOptions = {}) => {
	const wired = renderApp({
		path: options.path ?? "/p/CDE",
		actor: "navid",
		server: options.server,
		scheduler: options.scheduler,
	});
	await screen.findByRole("complementary", { name: "Sidebar" });
	return wired;
};

export const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
	fireEvent.keyDown(target, { key, ...init });

export const palette = () => screen.getByRole("dialog", { name: "Command palette" });

// Presses Cmd+K and returns the panel.
export const openPalette = async () => {
	press("k", { metaKey: true });
	return await screen.findByRole("dialog", { name: "Command palette" });
};

export const paletteInput = () => within(palette()).getByRole("combobox") as HTMLInputElement;

// The accessible name of one cmdk group: the text of the heading its
// aria-labelledby names.
const groupName = (group: Element) => {
	const id = group.getAttribute("aria-labelledby");
	return id === null ? "" : (document.getElementById(id)?.textContent ?? "");
};

// The section headings, in the order the palette draws them.
export const sectionNames = () => within(palette()).getAllByRole("group").map(groupName);

export const section = (name: string | RegExp) => {
	const match = within(palette())
		.getAllByRole("group")
		.find((group) => (typeof name === "string" ? groupName(group) === name : name.test(groupName(group))));
	if (match === undefined) throw new Error(`No palette section named ${String(name)}.`);
	return match;
};

// Every option of one section, in order.
export const itemsOf = (name: string | RegExp) => within(section(name)).getAllByRole("option");

// The identifier an option carries. cmdk writes the item value to
// `data-value`, and a ticket item's value is its identifier.
export const optionId = (option: Element) => option.getAttribute("data-value");

// The ticket the palette pins as its context, or null.
export const contextChip = () => palette().querySelector("[data-command-context]");

// Makes `currentPlatform()` read a Mac or a Linux machine.
export const asPlatform = (kind: "mac" | "other") => {
	const platform = kind === "mac" ? "MacIntel" : "Linux x86_64";
	const agent = kind === "mac" ? "Mozilla/5.0 (Macintosh)" : "Mozilla/5.0 (X11; Linux x86_64)";
	Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
	Object.defineProperty(navigator, "userAgent", { value: agent, configurable: true });
};
