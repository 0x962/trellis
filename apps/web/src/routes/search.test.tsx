import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
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
});
