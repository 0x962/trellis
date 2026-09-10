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

const closed = () => screen.queryByRole("dialog", { name: "Command menu" });

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette search", () => {
	// SR-06. The palette shows the top 6; the full list lives on /search.
	test("the Search results section shows the top six", async () => {
		await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Search results"));
		expect(itemsOf("Search results")).toHaveLength(6);
	});

	// SR-07
	test("a typo finds the seeded title through search.query", async () => {
		await search("restor teh fork");
		await waitFor(() => expect(sectionNames()).toContain("Search results"));
		expect(itemsOf("Search results").map(optionId)).toContain("CDE-42");
	});

	// SR-08
	test("Search results renders as the last section", async () => {
		await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Search results"));
		const names = sectionNames();
		expect(names[names.length - 1]).toBe("Search results");
		expect(names[names.length - 2]).toBe("View");
	});

	// SR-09
	test("Enter on a result opens the peek", async () => {
		const { router, user } = await search("page");
		await waitFor(() => expect(sectionNames()).toContain("Search results"));
		const first = itemsOf("Search results")[0]!;
		const identifier = optionId(first)!;
		await user.click(first);
		await waitFor(() => expect((router.state.location.search as { peek?: string }).peek).toBe(identifier));
		await waitFor(() => expect(closed()).toBeNull());
	});

	// SR-10. The full search page takes the same query, with the filters of
	// the view on top.
	test("Cmd+Enter opens the full search page for the query", async () => {
		const { router, user } = await search("oauth");
		await waitFor(() => expect(sectionNames()).toContain("Search results"));
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
		expect(sectionNames()).not.toContain("Search results");
	});
});
