import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import {
	openPalette,
	palette,
	paletteInput,
	renderShell,
	resetStores,
	section,
	sectionNames,
} from "../../../../test/palette";
import { createTestServer, type TestServer } from "../../../../test/server";
import { useUiStore } from "../../../stores/uiStore";
import { useComposerStore } from "../../composer";
import { commandActions } from "../commandStore";

const user = () => userEvent.setup();

const pick = async (name: RegExp) => {
	const option = within(palette()).getByRole("option", { name });
	await user().click(option);
};

const callsTo = (server: TestServer, path: string) => server.calls.filter((call) => call.path.join(".") === path);

const closed = () => screen.queryByRole("dialog", { name: "Command palette" });

const withTicket = async (identifier = "CDE-42", path = "/p/CDE") => {
	const shell = await renderShell({ path });
	act(() => commandActions.setPeekTicket(identifier));
	await openPalette();
	return shell;
};

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette actions", () => {
	// A person types the command's name, then picks it. The typed words
	// named the command, not a status, so the status list shows in full.
	test("a command picked by its typed name opens its submenu with every choice", async () => {
		await withTicket();
		await user().type(paletteInput(), "Change status");
		await pick(/Change status/);
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /Human Review/ })).toBeDefined());
		expect(within(palette()).getByRole("option", { name: /In Progress/ })).toBeDefined();
		expect(paletteInput().value).toBe("");
	});

	// PA-01. The call names the status by slug or by name, never by an
	// opaque id.
	test("Change status opens the status list and applies the pick through tickets.update", async () => {
		const { server } = await withTicket();
		await pick(/Change status/);
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /Human Review/ })).toBeDefined());
		await pick(/Human Review/);
		await waitFor(() => expect(callsTo(server, "tickets.update")).toHaveLength(1));
		const input = callsTo(server, "tickets.update")[0]!.input as { ticket: string; status: string };
		expect(input.ticket).toBe("CDE-42");
		expect(input.status).toMatch(/human/i);
		await waitFor(() => expect(closed()).toBeNull());
	});

	// PA-02
	test("Set priority applies the pick through tickets.update", async () => {
		const { server } = await withTicket();
		await pick(/Set priority/);
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /Urgent/ })).toBeDefined());
		await pick(/Urgent/);
		await waitFor(() => expect(callsTo(server, "tickets.update")).toHaveLength(1));
		expect(callsTo(server, "tickets.update")[0]!.input).toEqual({ ticket: "CDE-42", priority: "urgent" });
	});

	// PA-03
	test("Escape inside a submenu returns to the section list", async () => {
		await withTicket();
		await pick(/Change status/);
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /Human Review/ })).toBeDefined());
		await user().keyboard("{Escape}");
		await waitFor(() => expect(sectionNames()[0]).toBe("This ticket"));
		expect(closed()).not.toBeNull();
	});

	// PA-04
	test("a Selection action sends one bulk call for every selected row", async () => {
		const { server } = await renderShell();
		const selection = ["CDE-42", "CDE-44", "CDE-41"];
		act(() => commandActions.setSelection(selection));
		await openPalette();
		await user().click(within(section(/Selection/)).getByRole("option", { name: /status/i }));
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /Human Review/ })).toBeDefined());
		await pick(/Human Review/);
		await waitFor(() => expect(callsTo(server, "tickets.updateMany")).toHaveLength(1));
		expect((callsTo(server, "tickets.updateMany")[0]!.input as { tickets: string[] }).tickets).toEqual(selection);
	});

	// PA-05
	test("Open full page navigates to the ticket route", async () => {
		const { router } = await withTicket();
		await pick(/Open full page/);
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-42"));
	});

	// PA-06
	test("New sub-ticket opens the composer with the parent filled", async () => {
		await withTicket();
		await pick(/New sub-ticket/);
		await waitFor(() => expect(useComposerStore.getState().open).toBe(true));
		expect(useComposerStore.getState().options.parent).toBe("CDE-42");
	});

	// PA-07. A ticket created from a view takes the view's project. A status
	// filter does not seed the status (T7): the composer then uses the
	// project default status.
	test("New ticket opens the composer with the current view defaults", async () => {
		await renderShell({ path: "/p/CDE?status=in-progress" });
		await openPalette();
		await pick(/New ticket/);
		await waitFor(() => expect(useComposerStore.getState().open).toBe(true));
		expect(useComposerStore.getState().options).toMatchObject({ project: "CDE" });
		expect(useComposerStore.getState().options.status).toBeUndefined();
	});

	// PA-08
	test("Toggle theme flips the theme", async () => {
		await renderShell();
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		await openPalette();
		await pick(/Toggle theme/);
		await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
	});

	// PA-09
	test("Toggle sidebar toggles the interface store", async () => {
		await renderShell();
		expect(useUiStore.getState().sidebarCollapsed).toBe(false);
		await openPalette();
		await pick(/Toggle sidebar/);
		await waitFor(() => expect(useUiStore.getState().sidebarCollapsed).toBe(true));
	});

	// PA-10
	test("Toggle density toggles the interface store", async () => {
		await renderShell();
		expect(useUiStore.getState().density).toBe("comfortable");
		await openPalette();
		await pick(/Toggle density/);
		await waitFor(() => expect(useUiStore.getState().density).toBe("compact"));
	});

	// PA-11
	test("a Go to project item navigates to the project route", async () => {
		const server = createTestServer();
		await server.client.projects.create({ parent: "CDE.web", name: "auth" });
		const { router } = await renderShell({ server });
		await openPalette();
		await pick(/Go to project…/);
		await waitFor(() => expect(within(palette()).getByRole("option", { name: /CDE\/web\/auth/ })).toBeDefined());
		await pick(/CDE\/web\/auth/);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/web/auth"));
	});

	// PA-12
	test("picking an item closes the palette", async () => {
		await withTicket();
		await pick(/Copy ID/);
		await waitFor(() => expect(closed()).toBeNull());
	});
});
