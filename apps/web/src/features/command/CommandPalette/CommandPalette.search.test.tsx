import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { mockMatchMedia } from "../../../../test/media";
import {
	itemsOf,
	openPalette,
	optionId,
	palette,
	paletteInput,
	renderShell,
	resetStores,
	section,
	sectionNames,
} from "../../../../test/palette";

// Renders the shell with a clock, opens the palette, types `query`, and
// waits for the debounce to run the search.
const search = async (query: string) => {
	const clock = createFakeScheduler();
	const shell = await renderShell({ scheduler: clock.scheduler });
	const user = userEvent.setup();
	await openPalette();
	await user.type(paletteInput(), query);
	act(() => clock.advanceTo(200));
	return { ...shell, user, clock };
};

const closed = () => screen.queryByRole("dialog", { name: "Command palette" });

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette search", () => {
	// SR-06. The palette shows the top 5; the full list lives on /search.
	test("the Tickets section shows the top five", async () => {
		await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		expect(itemsOf("Tickets")).toHaveLength(5);
	});

	// T8. A ticket row reads like a list row: the status icon, the ID in
	// faint mono, then the title.
	test("a ticket row shows the status icon, the ID in faint mono, then the title", async () => {
		await search("restor teh fork");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		const row = itemsOf("Tickets").find((option) => optionId(option) === "CDE-42")!;
		expect(row.querySelector("svg[data-category]")).not.toBeNull();
		const id = within(row).getByText("CDE-42");
		for (const name of ["font-mono", "text-fg-faint"]) expect(id.classList.contains(name)).toBe(true);
		const title = within(row).getByText(/Restore the fork pages/);
		expect(id.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// A page with no peek opens a picked ticket on its own page.
	test("on the ticket page and on Settings a picked ticket opens its page", async () => {
		for (const path of ["/t/CDE-44", "/settings"]) {
			const clock = createFakeScheduler();
			const shell = await renderShell({ path, scheduler: clock.scheduler });
			const user = userEvent.setup();
			await openPalette();
			await user.type(paletteInput(), "restor teh fork");
			act(() => clock.advanceTo(200));
			await waitFor(() => expect(sectionNames()).toContain("Tickets"));
			const row = itemsOf("Tickets").find((option) => optionId(option) === "CDE-42")!;
			await user.click(row);
			await waitFor(() => expect(shell.router.state.location.pathname).toBe("/t/CDE-42"));
			expect((shell.router.state.location.search as { peek?: string }).peek).toBeUndefined();
			shell.unmount();
			resetStores();
		}
	});

	// SR-07
	test("a typo finds the seeded title through search.query", async () => {
		await search("restor teh fork");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		expect(itemsOf("Tickets").map(optionId)).toContain("CDE-42");
	});

	// SR-08, T8. The tickets come before the matched commands.
	test("Tickets renders as the first section", async () => {
		await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		expect(sectionNames()[0]).toBe("Tickets");
	});

	// SR-09
	test("Enter on a result opens the peek", async () => {
		const { router, user } = await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		const first = itemsOf("Tickets")[0]!;
		const identifier = optionId(first)!;
		await user.click(first);
		await waitFor(() => expect((router.state.location.search as { peek?: string }).peek).toBe(identifier));
		await waitFor(() => expect(closed()).toBeNull());
	});

	// SR-10. The full search page takes the same query, with the filters of
	// the view on top.
	test("Cmd+Enter opens the full search page for the query", async () => {
		const { router, user } = await search("oauth");
		await waitFor(() => expect(sectionNames()).toContain("Tickets"));
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
		expect((router.state.location.search as { q?: string }).q).toBe("oauth");
		await waitFor(() => expect(closed()).toBeNull());
	});

	// SR-11
	test("typing an identifier puts the jump item first", async () => {
		await search("cde-1");
		const options = within(palette()).getAllByRole("option");
		expect(optionId(options[0]!)).toBe("CDE-1");
		expect(options[0]!.getAttribute("aria-selected")).toBe("true");
	});

	// SR-12
	test("Enter on the jump item opens that ticket", async () => {
		const { router, user } = await search("cde-1");
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-1"));
		await waitFor(() => expect(closed()).toBeNull());
	});

	// SR-13. The ref grammar is case-insensitive on input.
	test("the identifier jump ignores the letter case", async () => {
		const upper = await search("CDE-1");
		expect(optionId(within(palette()).getAllByRole("option")[0]!)).toBe("CDE-1");
		upper.unmount();
		resetStores();
		await search("cde-1");
		expect(optionId(within(palette()).getAllByRole("option")[0]!)).toBe("CDE-1");
	});

	// SR-14
	test("a query with no ticket keeps the command sections", async () => {
		await search("density");
		await waitFor(() => expect(within(section("View")).getAllByRole("option").length).toBeGreaterThan(0));
		expect(sectionNames()).not.toContain("Tickets");
	});
});
