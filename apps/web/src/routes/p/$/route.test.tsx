import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";

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
