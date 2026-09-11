import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TableEmpty } from "./TableEmpty";

describe("features/table/TableEmpty", () => {
	// Outcome 32
	test("offers the create button and the CLI line when the project is empty", async () => {
		const user = userEvent.setup();
		const onCreate = mock(() => {});
		renderWithProviders(<TableEmpty project="CDE" filtered={false} onCreate={onCreate} />, {
			path: "/p/CDE",
			actor: "navid",
		});
		expect(screen.getByRole("heading", { name: /no tickets/i })).toBeDefined();
		expect(screen.getByText('trellis create -p CDE -t "First ticket"')).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Create ticket" }));
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	// Outcome 33. The link drops every filter param and keeps the route.
	test("offers Clear filters when no ticket matches", () => {
		renderWithProviders(<TableEmpty project="CDE" filtered />, {
			path: "/p/CDE/table?status=canceled&priority=urgent",
			actor: "navid",
		});
		expect(screen.getByText("No tickets match")).toBeDefined();
		const clear = screen.getByRole("link", { name: "Clear filters" });
		expect(clear.getAttribute("href")).toBe("/p/CDE");
		expect(screen.queryByRole("button", { name: "Create ticket" })).toBeNull();
	});

	// Outcome 34
	test("names the search text in the empty state", () => {
		renderWithProviders(<TableEmpty project="CDE" filtered q="oauth" />, {
			path: "/p/CDE/table?q=oauth",
			actor: "navid",
		});
		expect(screen.getByText("No tickets match 'oauth'")).toBeDefined();
		expect(screen.getByRole("link", { name: "Clear filters" })).toBeDefined();
	});
});
