import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { mockMatchMedia } from "../../../../test/media";
import {
	contextChip,
	itemsOf,
	openPalette,
	palette,
	paletteInput,
	press,
	renderShell,
	resetStores,
	section,
	sectionNames,
} from "../../../../test/palette";
import { commandActions } from "../commandStore";

const ticketItems = [
	"Change status",
	"Set priority",
	"Move to project",
	"Set parent",
	"New sub-ticket",
	"Start with agent",
	"Copy ID",
	"Copy branch name",
	"Copy agent brief",
	"Copy link",
	"Open full page",
	"Delete",
];

const closed = () => screen.queryByRole("dialog", { name: "Command palette" });

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette", () => {
	// CP-01
	test("Cmd+K opens the palette and focuses the search field", async () => {
		await renderShell();
		await openPalette();
		expect(document.activeElement).toBe(paletteInput());
	});

	// CP-02
	test("Escape closes the palette", async () => {
		await renderShell();
		await openPalette();
		press("Escape", {}, paletteInput());
		await waitFor(() => expect(closed()).toBeNull());
	});

	// CP-03
	test("a second Cmd+K closes the palette", async () => {
		await renderShell();
		await openPalette();
		press("k", { metaKey: true }, paletteInput());
		await waitFor(() => expect(closed()).toBeNull());
	});

	// CP-04
	test("slash opens the palette in search mode", async () => {
		await renderShell();
		press("/");
		await screen.findByRole("dialog", { name: "Command palette" });
		expect(paletteInput().placeholder).toMatch(/search/i);
		expect(within(palette()).queryAllByRole("group")).toHaveLength(0);
	});

	// CP-05. The trigger key opens the palette; it is never text.
	test("the trigger key never types into the search field", async () => {
		await renderShell();
		press("/");
		await screen.findByRole("dialog", { name: "Command palette" });
		expect(paletteInput().value).toBe("");
		press("Escape", {}, paletteInput());
		await waitFor(() => expect(closed()).toBeNull());
		await openPalette();
		expect(paletteInput().value).toBe("");
	});

	// CP-06
	test("Cmd+K opens the palette from inside a text field", async () => {
		await renderShell();
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		press("k", { metaKey: true }, input);
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeDefined();
		input.remove();
	});

	// CP-07. The field keeps the focus, so typing never stops; the active
	// option is named for a screen reader.
	test("the arrow keys move the active option and the field keeps the focus", async () => {
		const user = userEvent.setup();
		await renderShell();
		await openPalette();
		await user.keyboard("{ArrowDown}");
		const input = paletteInput();
		expect(document.activeElement).toBe(input);
		const active = input.getAttribute("aria-activedescendant");
		expect(active).not.toBeNull();
		expect(document.getElementById(active!)?.getAttribute("role")).toBe("option");
	});

	// CP-08
	test("the palette exposes dialog, listbox, and option roles", async () => {
		await renderShell();
		const dialog = await openPalette();
		expect(within(dialog).getByRole("listbox")).toBeDefined();
		const options = within(dialog).getAllByRole("option");
		expect(options.length).toBeGreaterThan(0);
		for (const option of options) expect(option.getAttribute("aria-selected")).toBeString();
	});

	// CP-09
	test("closing the palette returns the focus to the previous element", async () => {
		await renderShell();
		const row = document.createElement("button");
		document.body.appendChild(row);
		row.focus();
		await openPalette();
		press("Escape", {}, paletteInput());
		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	// CP-10
	test("a bare context shows Create, Go to, and View only", async () => {
		await renderShell();
		await openPalette();
		expect(sectionNames()).toEqual(["Create", "Go to", "View"]);
	});

	// CP-11
	test("a focused row adds the This ticket section and the context chip", async () => {
		await renderShell();
		act(() => commandActions.setFocusedTicket("CDE-42"));
		await openPalette();
		expect(sectionNames()[0]).toBe("This ticket");
		expect(contextChip()?.textContent).toBe("CDE-42");
	});

	// CP-12
	test("an open peek supplies the This ticket context", async () => {
		await renderShell();
		act(() => commandActions.setPeekTicket("CDE-42"));
		await openPalette();
		expect(sectionNames()[0]).toBe("This ticket");
		expect(contextChip()?.textContent).toBe("CDE-42");
	});

	// CP-13
	test("a selection adds the Selection section with the count", async () => {
		await renderShell();
		act(() => commandActions.setSelection(["CDE-42", "CDE-44", "CDE-41"]));
		const dialog = await openPalette();
		expect(within(dialog).getByRole("group", { name: /3 tickets/ })).toBeDefined();
		expect(itemsOf(/Selection/).length).toBeGreaterThan(0);
	});

	// CP-14
	test("This ticket comes before Selection when both apply", async () => {
		await renderShell();
		act(() => {
			commandActions.setFocusedTicket("CDE-42");
			commandActions.setSelection(["CDE-42", "CDE-44", "CDE-41"]);
		});
		await openPalette();
		const names = sectionNames();
		expect(names[0]).toBe("This ticket");
		expect(names[1]).toMatch(/Selection/);
	});

	// CP-15
	test("the This ticket section holds every item in the spec", async () => {
		await renderShell();
		act(() => commandActions.setPeekTicket("CDE-42"));
		await openPalette();
		const group = section("This ticket");
		for (const label of ticketItems) {
			expect(within(group).getByRole("option", { name: new RegExp(label) }), label).toBeDefined();
		}
	});

	// CP-16. The seed links PR 118 to CDE-42; the test links PR 121 to it
	// as a second one.
	test("one Open PR item appears per linked pull request", async () => {
		const server = createFakeServer();
		const first = await server.client.tickets.get({ ticket: "CDE-42" });
		const second = await server.client.tickets.get({ ticket: "CDE-44" });
		server.state.prLinks.push({
			ticketId: first.id,
			prId: second.prs[0]!.id,
			source: "manual",
			linkedBy: { kind: "human", name: "navid" },
			linkedAt: new Date().toISOString(),
		});
		await renderShell({ server });
		act(() => commandActions.setPeekTicket("CDE-42"));
		await openPalette();
		const group = section("This ticket");
		expect(within(group).getByRole("option", { name: new RegExp(`#${first.prs[0]!.number}`) })).toBeDefined();
		expect(within(group).getByRole("option", { name: new RegExp(`#${second.prs[0]!.number}`) })).toBeDefined();
	});

	// CP-17, CK-1. New sub-ticket lives in This ticket only, so no two rows
	// open the same dialog.
	test("the Create section adds the sub-project item on a project route", async () => {
		await renderShell({ path: "/p/CDE" });
		act(() => commandActions.setPeekTicket("CDE-42"));
		await openPalette();
		expect(itemsOf("Create")).toHaveLength(3);
		for (const label of ["New ticket", "New project", "New sub-project"]) {
			expect(within(section("Create")).getByRole("option", { name: new RegExp(label) }), label).toBeDefined();
		}
		expect(within(section("Create")).queryByRole("option", { name: /New sub-ticket/ })).toBeNull();
		expect(within(section("This ticket")).getAllByRole("option", { name: /New sub-ticket/ })).toHaveLength(1);
	});

	// CP-18
	test("the Create section drops the sub items out of context", async () => {
		await renderShell({ path: "/needs-you" });
		await openPalette();
		expect(itemsOf("Create")).toHaveLength(2);
		expect(within(section("Create")).getByRole("option", { name: /New ticket/ })).toBeDefined();
		expect(within(section("Create")).getByRole("option", { name: /New project/ })).toBeDefined();
	});

	// CP-20
	test("the view items stay out of the Go to section off a project route", async () => {
		await renderShell({ path: "/needs-you" });
		await openPalette();
		const group = section("Go to");
		expect(within(group).queryByRole("option", { name: /^Board/ })).toBeNull();
		expect(within(group).queryByRole("option", { name: /^Table/ })).toBeNull();
	});

	// CP-21
	test("the View section holds the six view items", async () => {
		await renderShell();
		await openPalette();
		expect(itemsOf("View")).toHaveLength(6);
		for (const label of ["Filter by", "Sort by", "Group by", "Toggle density", "Toggle theme", "Toggle sidebar"]) {
			expect(within(section("View")).getByRole("option", { name: new RegExp(label) }), label).toBeDefined();
		}
	});

	// CP-22
	test("an item shows its shortcut from the shared map", async () => {
		await renderShell();
		act(() => commandActions.setPeekTicket("CDE-42"));
		await openPalette();
		const item = within(section("This ticket")).getByRole("option", { name: /Change status/ });
		expect(within(item).getByText("s").tagName).toBe("KBD");
	});

	// CP-23
	test("an item without a mapped key shows no key element", async () => {
		await renderShell();
		await openPalette();
		const item = within(section("Create")).getByRole("option", { name: /New project/ });
		expect(item.querySelector("kbd")).toBeNull();
	});

	// CP-25
	test("reduced motion replaces the panel scale with a fade", async () => {
		mockMatchMedia(true);
		await renderShell();
		const dialog = await openPalette();
		expect(dialog.className).toContain("motion-reduce:data-starting-style:scale-100");
		expect(dialog.className).toContain("motion-reduce:data-ending-style:scale-100");
	});

	// CP-26
	test("a query with no match shows the empty text", async () => {
		const clock = createFakeScheduler();
		await renderShell({ scheduler: clock.scheduler });
		const user = userEvent.setup();
		await openPalette();
		await user.type(paletteInput(), "zzzzqqq");
		act(() => clock.advanceTo(200));
		await waitFor(() => expect(within(palette()).getByText(/No results/)).toBeDefined());
	});
});
