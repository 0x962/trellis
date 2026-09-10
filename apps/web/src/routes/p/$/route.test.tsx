import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import {
	filterBar,
	findGrid,
	footer,
	groupHeaders,
	inputs,
	queryGroupHeader,
	resetUi,
	rowOf,
	rows,
} from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

beforeEach(() => localStorage.clear());

describe("routes/p/$", () => {
	// WS-84
	test("the project route resolves the splat, shows the breadcrumb, and 404s an unknown path", async () => {
		const missing = renderApp({ path: "/p/CDE/web/auth/board", actor: "navid" });
		expect(await screen.findByText("CDE.web.auth doesn't exist")).toBeDefined();
		missing.unmount();

		localStorage.clear();
		renderApp({ path: "/p/CDE/web", actor: "navid" });
		const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(crumbs.textContent!.replace(/\s+/g, " ")).toMatch(/CDE\s*›\s*web/);
		expect(within(crumbs).getByRole("link", { name: "CDE" }).getAttribute("href")).toBe("/p/CDE");
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
		expect(screen.getByText("in CDE/web + sub-projects")).toBeDefined();
	});

	// WS-85. The table is the default view, so its URL carries no segment
	// and no search params.
	test("the view segmented control switches between /p/CDE and /p/CDE/board", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/board", actor: "navid" });
		const group = await screen.findByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("true");
		await user.click(within(group).getByRole("radio", { name: "Table" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE"));
		expect(router.state.location.searchStr).toBe("");
		await user.click(within(group).getByRole("radio", { name: "Board" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/board"));
	});

	// WS-86
	test("the route strips default search params and passes the grammar to the API", async () => {
		const { router, server } = renderApp({
			path: "/p/CDE?status=in-progress&sort=-updatedAt&density=comfortable",
			actor: "navid",
		});
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
		expect(router.state.location.pathname).toBe("/p/CDE");
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "tickets.counts");
			expect(call).toBeDefined();
			expect(call!.input).toEqual({ project: "CDE", status: ["in-progress"] });
		});
	});

	// WS-87
	test("the project settings view renders its placeholder chrome", async () => {
		renderApp({ path: "/p/CDE/settings", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "CDE settings" })).toBeDefined();
		const main = screen.getByRole("main");
		expect(main.textContent).toMatch(/statuses/i);
		expect(main.textContent).toMatch(/sub-projects/i);
		expect(main.textContent).toMatch(/\bkey\b/i);
	});

	// WS-88. The CLI line is the fastest way to a first ticket.
	test("an empty project shows the CLI empty state", async () => {
		const server = createFakeServer();
		await server.client.projects.create({ key: "DOC", name: "Docs" });
		renderApp({ path: "/p/DOC", actor: "navid", server });
		expect(await screen.findByText('trellis new -p DOC "First ticket"')).toBeDefined();
		expect(screen.getByRole("button", { name: "Create ticket" })).toBeDefined();
		expect(screen.getByRole("heading", { name: /no tickets/i })).toBeDefined();
	});
});

// The table on the project route. The viewport gives the virtualizer a
// height, so rows mount.
describe("routes/p/$: the table", () => {
	const installViewport = tableViewport(800);

	beforeEach(() => {
		resetUi();
		installViewport();
	});

	// Outcome 108
	test("renders the ticket table for a project route", async () => {
		const { server } = renderApp({ path: "/p/CDE", actor: "navid" });
		await findGrid();
		expect(filterBar()).not.toBeNull();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		expect(groupHeaders().length).toBeGreaterThan(1);
		expect(footer()).not.toBeNull();
		await waitFor(() => expect(footer().textContent).toMatch(/\d+ tickets/));
		expect(inputs(server, "tickets.list")[0]).toMatchObject({ project: "CDE" });
	});

	// Outcome 109
	test("maps the splat path to a dotted project ref", async () => {
		const server = createFakeServer();
		await server.client.projects.create({ parent: "CDE.web", name: "auth" });
		const { router } = renderApp({ path: "/p/CDE/web/auth", actor: "navid", server });
		await findGrid();
		await waitFor(() => expect(inputs(server, "tickets.list").length).toBeGreaterThan(0));
		expect(inputs(server, "tickets.list")[0]).toMatchObject({ project: "CDE.web.auth" });
		expect(router.state.location.pathname).toBe("/p/CDE/web/auth");
	});

	// Outcome 110. The grid element is the same node before and after.
	test("reruns the query on a filter change without remounting the table", async () => {
		const user = userEvent.setup();
		const { router, server } = renderApp({ path: "/p/CDE", actor: "navid" });
		const table = await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		const before = inputs(server, "tickets.list").length;
		await user.click(within(filterBar()).getByRole("button", { name: "Filter" }));
		await user.click(within(await screen.findByRole("dialog")).getByRole("option", { name: "Status" }));
		await user.click(within(await screen.findByRole("dialog")).getByRole("option", { name: "In Progress" }));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
		await waitFor(() => expect(inputs(server, "tickets.list").length).toBeGreaterThan(before));
		expect(inputs(server, "tickets.list").at(-1)).toMatchObject({ project: "CDE", status: ["in-progress"] });
		await waitFor(() => expect(queryGroupHeader("todo")).toBeNull());
		expect(screen.getByRole("grid")).toBe(table);
	});

	// Outcome 112
	test("keeps the table mounted and the row focused while the peek is open", async () => {
		renderApp({ path: "/p/CDE?status=human-review&peek=CDE-42", actor: "navid" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		expect(rowOf("CDE-42").getAttribute("tabindex")).toBe("0");
		expect(rowOf("CDE-42").hasAttribute("data-focused")).toBe(true);
		expect(rowOf("CDE-37").getAttribute("tabindex")).toBe("-1");
		expect(rowOf("CDE-37").hasAttribute("data-focused")).toBe(false);
	});
});
