import { beforeEach, describe, expect, test } from "bun:test";
import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeScheduler } from "../../../../../fakeScheduler";
import { mockMatchMedia } from "../../../../../media";
import {
	contextChip,
	itemsOf,
	openPalette,
	palette,
	paletteInput,
	renderShell,
	resetStores,
	section,
	sectionNames,
} from "../../../../../palette";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

// T8: the project row, the ticket context from the route, and the typed
// filter over the command rows.
describe("features/command/CommandPalette sections", () => {
	// T8. "Go to project…" carries the g p key and opens the project list.
	// A row shows the key badge, the name, and the path in faint mono.
	test("Go to project opens the project list, and a pick opens the project", async () => {
		const user = userEvent.setup();
		const { router } = await renderShell({ path: "/needs-you" });
		await openPalette();
		const row = within(section("Go to")).getByRole("option", { name: /Go to project…/ });
		expect([...row.querySelectorAll("kbd")].map((kbd) => kbd.textContent)).toEqual(["g", "p"]);
		await user.click(row);
		const web = await within(section("Go to project")).findByRole("option", { name: /CDE\/web/ });
		expect(within(web).getByText("CDE").className).toMatch(/\bfont-mono\b/);
		expect(within(web).getByText("web")).toBeDefined();
		const path = within(web).getByText("CDE/web");
		for (const name of ["font-mono", "text-xs", "text-fg-faint"]) expect(path.classList.contains(name)).toBe(true);
		await user.click(web);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/web/table"));
	});

	// T8. The ticket page and a peek in the URL name the ticket, so This
	// ticket is the first section there.
	test("the ticket page and a peek in the URL supply the This ticket context", async () => {
		const page = await renderShell({ path: "/t/CDE-42" });
		await openPalette();
		expect(sectionNames()[0]).toBe("This ticket");
		expect(contextChip()?.textContent).toBe("CDE-42");
		page.unmount();
		resetStores();
		await renderShell({ path: "/p/CDE?peek=CDE-44" });
		await openPalette();
		expect(sectionNames()[0]).toBe("This ticket");
		expect(contextChip()?.textContent).toBe("CDE-44");
	});

	// T8. Typed words filter the command rows by label and keywords. A group
	// with no match hides.
	test("typing filters the command rows and hides the groups with no match", async () => {
		const clock = createFakeScheduler();
		await renderShell({ scheduler: clock.scheduler });
		const user = userEvent.setup();
		await openPalette();
		await user.type(paletteInput(), "toggle");
		act(() => clock.advanceTo(200));
		await waitFor(() => expect(sectionNames()).not.toContain("Create"));
		expect(sectionNames()).not.toContain("Go to");
		const labels = itemsOf("View").map((option) => option.textContent ?? "");
		expect(labels.length).toBe(3);
		for (const label of labels) expect(label).toMatch(/^Toggle/);
	});

	// CP-19, T8. The projects sit behind one row, so the empty palette stays
	// short.
	test("the Go to section lists the destinations, one project row, and the current project views", async () => {
		await renderShell({ path: "/p/CDE" });
		await openPalette();
		const group = section("Go to");
		for (const label of ["Needs you", "All tickets", "Settings", "Go to project…", "Board", "Table"]) {
			expect(within(group).getByRole("option", { name: new RegExp(label) }), label).toBeDefined();
		}
		expect(itemsOf("Go to")).toHaveLength(6);
		expect(within(group).queryByRole("option", { name: /CDE\.web|CDE\/web/ })).toBeNull();
	});

	// CP-24, T8. happy-dom draws no layout, so the fixed height is the row
	// class and the position is the order of the sections. With a query,
	// the tickets come first and the commands follow.
	test("with a query the Tickets section comes first and the rows keep a fixed height", async () => {
		const clock = createFakeScheduler();
		await renderShell({ scheduler: clock.scheduler });
		const user = userEvent.setup();
		await openPalette();
		await user.type(paletteInput(), "terminal");
		act(() => clock.advanceTo(200));
		await waitFor(() => expect(sectionNames()[0]).toBe("Tickets"));
		expect(sectionNames()).not.toContain("Create");
		for (const option of within(palette()).getAllByRole("option")) {
			expect(option.className).toContain("h-8");
		}
	});
});
