import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/all/board", () => {
	test("the all-project board uses category columns and returns to the table", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/board", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "All tickets" })).toBeDefined();
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("true");
		await waitFor(() => expect(document.querySelectorAll("[data-board] > [data-category]")).toHaveLength(5));
		await user.click(within(group).getByRole("radio", { name: "Table" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/all"));
	});
});
