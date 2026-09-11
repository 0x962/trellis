import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mod } from "../../../../test/keyboard";
import { statusesOf } from "../../../../test/rows";
import { createTestServer, type TestServer } from "../../../../test/server";
import { renderTicket, settle, statusOf } from "../../../../test/ticketHost";
import { StartWithAgent } from "./StartWithAgent";

beforeEach(() => localStorage.clear());

// The seed's settings template is `claude "$(trellis brief {brief})"`.
const command = 'claude "$(trellis brief CDE-42)"';

const mount = (identifier = "CDE-42", server: TestServer = createTestServer()) =>
	renderTicket(identifier, (ticket) => <StartWithAgent ticket={ticket} />, { path: `/t/${identifier}`, server });

const start = () => screen.findByRole("button", { name: "Start with agent" });
const options = () => screen.getByRole("button", { name: "Start with agent options" });
const checkbox = () => screen.findByRole("checkbox", { name: "Also move to In Progress" });

// A dropdown action is a menu item or a button; either takes focus.
const action = (name: string) =>
	screen.queryByRole("menuitem", { name }) ??
	screen.queryByRole("menuitemcheckbox", { name }) ??
	screen.getByRole("button", { name });

const checked = (box: HTMLElement) =>
	box.getAttribute("aria-checked") === "true" || (box as HTMLInputElement).checked === true;

describe("features/agent/StartWithAgent", () => {
	// WT-89. The toast shows the command in the mono face.
	test("copies the exact command and toasts", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(await start());
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(command));
		expect(await screen.findByText("Copied the command. Paste it in a terminal.")).toBeDefined();
		const line = await screen.findByText(command);
		expect(line.className).toMatch(/\bfont-mono\b/);
		expect(line.className).toMatch(/\btruncate\b/);
	});

	// WT-90
	test("Cmd+Shift+A copies the command", async () => {
		userEvent.setup();
		mount();
		await start();
		mod("a", { shiftKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(command));
		expect(await screen.findByText("Copied the command. Paste it in a terminal.")).toBeDefined();
	});

	// WT-92
	test("the dropdown lists the four copy actions", async () => {
		const user = userEvent.setup();
		mount();
		await start();
		await user.click(options());
		for (const name of ["Copy command", "Copy command only", "Copy brief as markdown", "Copy CLI cheat-sheet"]) {
			const item = await waitFor(() => action(name));
			item.focus();
			expect(document.activeElement).toBe(item);
		}
	});

	// WT-93. The move rides along with the copy when the box is checked, and
	// the choice survives a remount on another ticket.
	test("also mark In Progress moves the ticket and is remembered", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const first = mount("CDE-42", server);
		await start();
		await user.click(options());
		await user.click(await checkbox());
		await user.keyboard("{Escape}");
		await user.click(await start());
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(command));
		await waitFor(() => expect(server.callsTo("tickets.move")).toHaveLength(1));
		expect(statusOf(await statusesOf(server, "CDE"), server.callsTo("tickets.move")[0]!.input)!.name).toBe(
			"In Progress",
		);
		await settle();
		expect(server.callsTo("tickets.move")).toHaveLength(1);
		first.unmount();
		mount("CDE-44", server);
		await start();
		await user.click(options());
		expect(checked(await checkbox())).toBe(true);
	});

	// The chevron is the second half of the primary split button, so it
	// carries the accent fill and never the surface fill of a default button.
	test("the options chevron carries the primary fill of the button beside it", async () => {
		mount();
		await start();
		const chevron = options();
		expect(chevron.classList.contains("bg-accent")).toBe(true);
		expect(chevron.classList.contains("text-on-accent")).toBe(true);
		expect(chevron.classList.contains("bg-surface")).toBe(false);
	});

	// WT-94
	test("an unchecked box leaves the status alone", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		mount("CDE-42", server);
		await user.click(await start());
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(command));
		await settle();
		expect(server.callsTo("tickets.move")).toHaveLength(0);
		expect(server.callsTo("tickets.update")).toHaveLength(0);
	});
});
