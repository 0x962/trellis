import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/search", () => {
	// WS-91. Three seeded tickets carry "oauth" in the title; no project does.
	test("the search route reads q and queries the API", async () => {
		const { server } = renderApp({ path: "/search?q=oauth", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "Search" })).toBeDefined();
		const input = screen.getByRole("searchbox") as HTMLInputElement;
		expect(input.value).toBe("oauth");
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "search.query");
			expect(call).toBeDefined();
			expect(call!.input).toEqual({ q: "oauth" });
		});
		expect(await screen.findByText(/3 tickets/)).toBeDefined();
		expect(screen.getByText(/0 projects/)).toBeDefined();
	});

	test("the search route applies filter chips above the result table", async () => {
		renderApp({ path: "/search?q=oauth&priority=high", actor: "navid" });
		const bar = await screen.findByTestId("search-filters");
		expect(within(bar).getByRole("button", { name: "Remove Priority" })).toBeDefined();
		const grid = await screen.findByRole("grid", { name: "Search results" });
		expect(within(grid).getByText("CDE-51")).toBeDefined();
		expect(within(grid).queryByText("TRL-12")).toBeNull();
		expect(within(grid).queryByText("MRG-3")).toBeNull();
	});
});
