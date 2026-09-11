import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../test/renderWithProviders";
import { findGrid, grid, identifiers, inputs, resetUi, rowOf, rows, visibleColumns } from "../../../test/table";
import { tableViewport } from "../../../test/viewport";

beforeEach(() => localStorage.clear());

describe("routes/all", () => {
	// WS-83. The footer is a fixed 28 px row (h-7), so the count arriving
	// never shifts the list.
	test("All tickets shows the topbar chrome and the count footer", async () => {
		const { server } = renderApp({ path: "/all/table", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "All tickets" })).toBeDefined();
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("false");
		expect(within(screen.getAllByRole("banner")[0]!).getByRole("button", { name: /New ticket/ })).toBeDefined();
		expect(document.querySelector("[data-filter-bar]")).not.toBeNull();
		const { total } = await server.client.tickets.counts({});
		const footer = document.querySelector("[data-list-footer]")!;
		expect(footer).not.toBeNull();
		expect(footer.className).toMatch(/\bh-7\b/);
		await waitFor(() => expect(footer.textContent).toContain(String(total)));
	});
});

// The table on the all-tickets route. The seed holds 31 + 14 + 3 = 48 active
// tickets across CDE, TRL, and MRG.
describe("routes/all: the table", () => {
	const installViewport = tableViewport(800);

	beforeEach(() => {
		resetUi();
		installViewport();
	});

	// Outcome 111
	test("renders every project's tickets with the project column on /all", async () => {
		const { server } = renderApp({ path: "/all/table", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(grid().getAttribute("aria-rowcount")).toBe("48"));
		await waitFor(() => expect(rows().length).toBeGreaterThan(5));
		for (const input of inputs(server, "tickets.list")) expect(input).not.toHaveProperty("project");
		expect(visibleColumns()).toContain("project");
		expect(document.querySelectorAll('[role="gridcell"][data-column="project"]').length).toBe(rows().length);
		const keys = new Set(identifiers().map((identifier) => identifier!.split("-")[0]));
		expect(keys.size).toBeGreaterThanOrEqual(2);
	});
});

// The peek on the all-tickets route. A row click and Enter write `?peek=`,
// and the route must mount the peek that reads it.
describe("routes/all: the peek", () => {
	const installViewport = tableViewport(800);

	beforeEach(() => {
		resetUi();
		installViewport();
	});

	// The identifiers of the rendered rows, in display order.
	const shownRows = async () => {
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		return identifiers() as string[];
	};

	test("a row click opens the peek with that ticket", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const [, second] = await shownRows();
		await user.click(rowOf(second!));
		const panel = await screen.findByRole("dialog", { name: second });
		expect(router.state.location.search).toMatchObject({ peek: second });
		expect(await within(panel).findByRole("textbox", { name: "Title" })).toBeDefined();
	});

	test("Enter on a focused row opens the peek with that ticket", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const [first] = await shownRows();
		rowOf(first!).focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("dialog", { name: first });
		expect(router.state.location.search).toMatchObject({ peek: first });
	});

	test("j and k walk the table rows inside the peek", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const [first, second] = await shownRows();
		await user.click(rowOf(first!));
		await screen.findByRole("dialog", { name: first });
		await user.keyboard("j");
		await screen.findByRole("dialog", { name: second });
		expect(router.state.location.search).toMatchObject({ peek: second });
		await user.keyboard("k");
		await screen.findByRole("dialog", { name: first });
		expect(router.state.location.search).toMatchObject({ peek: first });
	});

	test("Escape closes the peek and returns the focus to the row", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const [first] = await shownRows();
		rowOf(first!).focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("dialog", { name: first });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
		await waitFor(() => expect(document.activeElement).toBe(rowOf(first!)));
	});

	test("o in the peek opens the full ticket page", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "navid" });
		const [first] = await shownRows();
		await user.click(rowOf(first!));
		await screen.findByRole("dialog", { name: first });
		await user.keyboard("o");
		await waitFor(() => expect(router.state.location.pathname).toBe(`/t/${first}`));
	});
});
