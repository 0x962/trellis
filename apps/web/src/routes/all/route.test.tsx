import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/all", () => {
	// WS-83. The footer is a fixed 28 px row (h-7), so the count arriving
	// never shifts the list.
	test("All tickets shows the topbar chrome and the count footer", async () => {
		const { server } = renderApp({ path: "/all", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "All tickets" })).toBeDefined();
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("false");
		expect(document.querySelector("[data-filter-bar]")).not.toBeNull();
		const { total } = await server.client.tickets.counts({});
		const footer = document.querySelector("[data-list-footer]")!;
		expect(footer).not.toBeNull();
		expect(footer.className).toMatch(/\bh-7\b/);
		await waitFor(() => expect(footer.textContent).toContain(String(total)));
	});
});
