import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../renderWithProviders";
import { createTestServer } from "../../../server";

beforeEach(() => localStorage.clear());

describe("routes/search", () => {
	// WS-91. Three seeded tickets carry "oauth" in the title; no project does.
	test("the search route reads q and queries the API", async () => {
		const { server } = renderApp({ path: "/search?q=oauth", actor: "dana" });
		expect(await screen.findByRole("heading", { name: "Search" })).toBeDefined();
		const input = screen.getByRole("searchbox") as HTMLInputElement;
		expect(input.value).toBe("oauth");
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "search.query");
			expect(call).toBeDefined();
			// The server parses the query before the service sees it, so the
			// default page size travels with it.
			expect(call!.input).toEqual({ q: "oauth", limit: 20 });
		});
		expect(await screen.findByText(/2 tickets/)).toBeDefined();
		// T10. The project count shows only when a project matches.
		expect(screen.queryByText(/projects?/)).toBeNull();
	});

	// T10. The `/` hint shows while the field is empty.
	test("the empty field shows the / key, and typing hides it", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/search", actor: "dana" });
		const input = (await screen.findByRole("searchbox")) as HTMLInputElement;
		const field = input.closest("form")!;
		expect(field.querySelector("kbd")?.textContent).toBe("/");
		await user.type(input, "oauth");
		expect(field.querySelector("kbd")).toBeNull();
	});

	// SR-1. The glossary word for a ticket code is ID.
	test("the empty state names a ticket ID", async () => {
		renderApp({ path: "/search", actor: "dana" });
		expect(
			await screen.findByText(
				"A ticket ID such as CDE-42 opens the ticket. A word matches ticket titles, descriptions, and project names.",
			),
		).toBeDefined();
	});

	// T10. Each matched term in a result title is marked.
	test("marks the matched term in each result title", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const grid = await screen.findByRole("grid", { name: "Search results" });
		await waitFor(() => expect(grid.querySelectorAll("mark").length).toBeGreaterThan(0));
		for (const mark of grid.querySelectorAll("mark")) expect(mark.textContent!.toLowerCase()).toBe("oauth");
	});

	test("the search route applies filter chips above the result table", async () => {
		renderApp({ path: "/search?q=oauth&priority=high", actor: "dana" });
		const bar = await screen.findByTestId("search-filters");
		expect(within(bar).getByRole("button", { name: "Remove Priority" })).toBeDefined();
		const grid = await screen.findByRole("grid", { name: "Search results" });
		expect(within(grid).getByText("CDE-51")).toBeDefined();
		expect(within(grid).queryByText("TRL-12")).toBeNull();
	});

	// The command palette opens a result in a peek over the page it is on, so
	// on /search it writes `?peek=` and the route must mount the peek. j and
	// k inside the peek walk the results in the order the page lists them.
	test("the search route opens the peek from the URL, and j and k walk the results", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { tickets } = await server.client.search.query({ q: "oauth" });
		const [first, second] = tickets.map((ticket) => ticket.identifier);
		const { router } = renderApp({ path: `/search?q=oauth&peek=${first}`, actor: "dana", server });
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
