import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../test/fake-server";
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

	// The command palette opens a result in a peek over the page it is on, so
	// on /search it writes `?peek=` and the route must mount the peek. j and
	// k inside the peek walk the results in the order the page lists them.
	test("the search route opens the peek from the URL, and j and k walk the results", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const { tickets } = await server.client.search.query({ q: "oauth" });
		const [first, second] = tickets.map((ticket) => ticket.identifier);
		const { router } = renderApp({ path: `/search?q=oauth&peek=${first}`, actor: "navid", server });
		await screen.findByRole("dialog", { name: first });
		await user.keyboard("j");
		await screen.findByRole("dialog", { name: second });
		expect(router.state.location.search).toMatchObject({ q: "oauth", peek: second });
		await user.keyboard("k");
		await screen.findByRole("dialog", { name: first });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).toEqual({ q: "oauth" });
	});
});
