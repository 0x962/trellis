import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderApp } from "../../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

const footer = () => document.querySelector("[data-list-footer]");

describe("routes: the board footer", () => {
	// A board column lists the ticket that changed last at the top, so its
	// footer names that order and not the table's sort.
	test("the project board and the all-ticket board footers name the last update order", async () => {
		for (const path of ["/p/CDE", "/all"]) {
			const view = renderApp({ path, actor: "navid" });
			await waitFor(() => expect(footer()?.textContent, path).toContain("Sorted by the last update"));
			expect(footer()!.textContent, path).not.toContain("priority");
			view.unmount();
			localStorage.clear();
		}
	});
});
