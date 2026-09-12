import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../../renderWithProviders";
import { seedTickets } from "../../../../../seedMany";
import { createTestServer } from "../../../../../server";
import { findGrid, groupCount, groupHeader, groupRows, resetUi, rowOf } from "../../../../../table";
import { tableViewport } from "../../../../../viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const path = "/p/CDE/table?status=in-progress";

// The seed holds 4 In Progress tickets in the CDE subtree.
describe("features/table/GroupHeader", () => {
	// Outcome 28. 8 seeded rows and the 4 of the seed make 12.
	test("shows the status icon, name, count, and the create button", async () => {
		const server = createTestServer();
		await seedTickets(server, { project: "CDE", count: 8, status: "in-progress" });
		renderApp({ path, actor: "dana", server });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		const header = groupHeader("in-progress");
		expect(header.querySelector('svg[data-category="started"]')).not.toBeNull();
		expect(header.textContent).toContain("In Progress");
		expect(groupCount("in-progress")).toBe("12");
		expect(within(header).getByRole("button", { name: "New ticket in In Progress" })).toBeDefined();
	});

	// Outcome 29
	test("opens the composer with the group's status", async () => {
		const user = userEvent.setup();
		renderApp({ path, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		await user.click(within(groupHeader("in-progress")).getByRole("button", { name: "New ticket in In Progress" }));
		const dialog = await screen.findByRole("dialog", { name: /new ticket/i });
		expect(within(dialog).getByRole("button", { name: /^status/i }).textContent).toContain("In Progress");
	});

	// Outcome 30
	test("toggles the group open and closed from the header", async () => {
		const user = userEvent.setup();
		renderApp({ path, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		expect(groupRows("in-progress")).toHaveLength(4);
		const toggle = () => within(groupHeader("in-progress")).getByRole("button", { name: "In Progress" });
		await user.click(toggle());
		expect(groupHeader("in-progress").getAttribute("aria-expanded")).toBe("false");
		expect(groupRows("in-progress")).toHaveLength(0);
		expect(groupCount("in-progress")).toBe("4");
		await user.click(toggle());
		expect(groupHeader("in-progress").getAttribute("aria-expanded")).toBe("true");
		await waitFor(() => expect(groupRows("in-progress")).toHaveLength(4));
	});
});
