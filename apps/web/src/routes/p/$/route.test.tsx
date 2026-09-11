import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errors } from "@trellis/api";
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
	// The splat route owns `/p/<path>/settings` for a root project and for a
	// sub-project. The name field proves which project the screen loaded.
	test("renders the settings screen for /p/TRL/settings and /p/CDE/web/settings", async () => {
		const cases = [
			["/p/TRL/settings", "TRL"],
			["/p/CDE/web/settings", "CDE.web"],
		] as const;
		for (const [path, ref] of cases) {
			const server = createFakeServer();
			const project = await server.client.projects.get({ project: ref });
			const view = renderApp({ path, actor: "navid", server });
			const name = await screen.findByRole("textbox", { name: "Project name" });
			expect((name as HTMLInputElement).value, path).toBe(project.name);
			// Spec PS-1: the title is the breadcrumb of the project names.
			const crumbs = [...project.ancestors.map((ancestor) => ancestor.name), project.name, "Settings"].join(" › ");
			expect(screen.getByRole("heading", { name: crumbs }), path).toBeDefined();
			view.unmount();
			localStorage.clear();
		}
	});

	// WS-84
	test("the project route resolves the splat, shows the breadcrumb, and 404s an unknown path", async () => {
		const missing = renderApp({ path: "/p/CDE/web/auth/board", actor: "navid" });
		expect(await screen.findByText("CDE.web.auth does not exist")).toBeDefined();
		missing.unmount();

		localStorage.clear();
		renderApp({ path: "/p/CDE/web/table", actor: "navid" });
		const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(crumbs.textContent!.replace(/\s+/g, " ")).toMatch(/CDE\s*›\s*web/);
		expect(within(crumbs).getByRole("link", { name: "CDE" }).getAttribute("href")).toBe("/p/CDE");
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
		expect(screen.getByText("in CDE/web + sub-projects")).toBeDefined();
	});

	test("project settings save the editable project fields", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/web/settings", actor: "navid" });
		const name = await screen.findByRole("textbox", { name: "Project name" });
		await user.clear(name);
		await user.type(name, "Web platform");
		const slug = screen.getByRole("textbox", { name: "Slug" });
		await user.clear(slug);
		await user.type(slug, "web-platform");
		await user.type(screen.getByRole("textbox", { name: "Description" }), "Browser product work");
		await user.click(screen.getByRole("button", { name: "Save project" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "projects.update");
			expect(call?.input).toEqual({
				project: "CDE.web",
				name: "Web platform",
				slug: "web-platform",
				description: "Browser product work",
			});
		});
	});

	test("Customize copies inherited statuses and Clear restores inheritance", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/web/settings#statuses", actor: "navid" });
		expect(await screen.findByText("Inherited from CDE")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Customize" }));
		await user.type(screen.getByRole("textbox", { name: "Status name" }), "Ready");
		await user.click(screen.getByRole("button", { name: "Create status" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "statuses.create");
			expect(call?.input).toMatchObject({ project: "CDE.web", name: "Ready", category: "todo" });
		});
		expect(await screen.findByText("This project owns its statuses.")).toBeDefined();
		expect(screen.getByDisplayValue("Ready")).toBeDefined();
		expect(screen.getByDisplayValue("Todo")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Clear" }));
		const dialog = await screen.findByRole("dialog", { name: "Clear statuses?" });
		await user.click(within(dialog).getByRole("button", { name: "Clear statuses" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "statuses.clear");
			expect(call?.input).toEqual({ project: "CDE.web" });
		});
		expect(await screen.findByText("Inherited from CDE")).toBeDefined();
		expect(screen.queryByDisplayValue("Ready")).toBeNull();
	});

	test("a status reorder sends the full order", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const initial = await server.client.statuses.list({ project: "CDE" });
		renderApp({ path: "/p/CDE/settings#statuses", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Move Todo down" }));
		const expected = [
			initial.statuses[1]!.id,
			initial.statuses[0]!.id,
			...initial.statuses.slice(2).map((status) => status.id),
		];
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "statuses.reorder");
			expect(call?.input).toEqual({ project: "CDE", statuses: expected });
		});
	});

	test("status fields save the token color, reviewer, WIP limit, and default", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/settings#statuses", actor: "navid" });
		const name = await screen.findByRole("textbox", { name: "Name for Agent Review" });
		await user.clear(name);
		await user.type(name, "Quality review");
		await user.click(screen.getByRole("combobox", { name: "Color for Agent Review" }));
		await user.click(screen.getByRole("option", { name: "Agent" }));
		await user.click(screen.getByRole("combobox", { name: "Reviewer for Agent Review" }));
		await user.click(screen.getByRole("option", { name: "Human" }));
		await user.type(screen.getByRole("spinbutton", { name: "WIP limit for Agent Review" }), "3");
		await user.click(screen.getByRole("checkbox", { name: "Default status Agent Review" }));
		await user.click(screen.getByRole("button", { name: "Save Agent Review" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "statuses.update");
			expect(call?.input).toMatchObject({
				project: "CDE",
				name: "Quality review",
				color: "agent",
				reviewer: "human",
				wipLimit: 3,
				isDefault: true,
			});
		});
	});

	test("deleting a used status shows its ticket count and requires moveTo", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const statuses = (await server.client.statuses.list({ project: "CDE" })).statuses;
		const source = statuses.find((status) => status.slug === "in-progress")!;
		const target = statuses.find((status) => status.slug === "todo")!;
		const count = [...server.state.tickets.values()].filter((ticket) => ticket.statusId === source.id).length;
		renderApp({ path: "/p/CDE/settings#statuses", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete In Progress" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete In Progress?" });
		await user.click(within(dialog).getByRole("button", { name: "Delete status" }));
		const uses = count === 1 ? "ticket uses" : "tickets use";
		expect(
			await within(dialog).findByText(`${count} ${uses} this status. Select a status to move them to.`),
		).toBeDefined();
		const calls = server.calls.filter((entry) => entry.path.join(".") === "statuses.delete");
		expect(calls[0]!.input).toEqual({ project: "CDE", status: source.id });
		await user.click(within(dialog).getByRole("combobox", { name: "Move tickets to" }));
		await user.click(screen.getByRole("option", { name: "Todo" }));
		await user.click(within(dialog).getByRole("button", { name: "Delete status" }));
		await waitFor(() => {
			const last = server.calls.filter((entry) => entry.path.join(".") === "statuses.delete").at(-1);
			expect(last?.input).toEqual({ project: "CDE", status: source.id, moveTo: target.id });
		});
	});

	test("deleting the last status shows LAST_STATUS inline", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const root = [...server.state.projects.values()].find((project) => project.path === "CDE")!;
		const own = [...server.state.statuses.values()].filter((status) => status.projectId === root.id);
		const remaining = own[0]!;
		const removed = new Set(own.slice(1).map((status) => status.id));
		for (const ticket of server.state.tickets.values()) {
			if (removed.has(ticket.statusId)) ticket.statusId = remaining.id;
		}
		for (const status of own.slice(1)) server.state.statuses.delete(status.id);
		renderApp({ path: "/p/CDE/settings#statuses", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete Todo" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete Todo?" });
		await user.click(within(dialog).getByRole("button", { name: "Delete status" }));
		expect(await within(dialog).findByText(errors.LAST_STATUS.message)).toBeDefined();
	});

	test("the key field shows KEY_LOCKED after the first ticket", async () => {
		renderApp({ path: "/p/CDE/settings", actor: "navid" });
		const key = (await screen.findByRole("textbox", { name: "Key" })) as HTMLInputElement;
		expect(key.readOnly).toBe(true);
		// Spec PS-2: a quiet hint with a lock says why the key is read-only.
		expect(screen.getByText(/The key cannot change after the project has a ticket\./)).toBeDefined();
	});

	test("repositories add and remove through projects.setRepos", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/web/settings#repositories", actor: "navid" });
		const repository = await screen.findByRole("textbox", { name: "Repository" });
		await user.type(repository, "openai/codex");
		await user.click(screen.getByRole("button", { name: "Add repository" }));
		await waitFor(() => {
			const call = server.calls.filter((entry) => entry.path.join(".") === "projects.setRepos").at(-1);
			expect(call?.input).toEqual({ project: "CDE.web", repos: [{ owner: "openai", repo: "codex" }] });
		});
		expect(await screen.findByText("openai/codex")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Remove openai/codex" }));
		await waitFor(() => {
			const call = server.calls.filter((entry) => entry.path.join(".") === "projects.setRepos").at(-1);
			expect(call?.input).toEqual({ project: "CDE.web", repos: [] });
		});
		expect(screen.queryByText("openai/codex")).toBeNull();
	});

	// WS-85. The table is the default view, so its URL carries no segment
	// and no search params.
	test("the view segmented control switches between /p/CDE and /p/CDE/table", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE", actor: "navid" });
		const group = await screen.findByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("true");
		await user.click(within(group).getByRole("radio", { name: "Table" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/table"));
		expect(router.state.location.searchStr).toBe("");
		await user.click(within(group).getByRole("radio", { name: "Board" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE"));
	});

	// WS-86
	test("the route strips default search params and passes the grammar to the API", async () => {
		const { router, server } = renderApp({
			path: "/p/CDE/table?status=in-progress&sort=-updatedAt&density=comfortable",
			actor: "navid",
		});
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
		expect(router.state.location.pathname).toBe("/p/CDE/table");
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "tickets.counts");
			expect(call).toBeDefined();
			expect(call!.input).toEqual({ project: "CDE", status: ["in-progress"] });
		});
	});

	// WS-87
	test("the project settings view renders its placeholder chrome", async () => {
		const { server } = renderApp({ path: "/p/CDE/settings", actor: "navid" });
		const project = await server.client.projects.get({ project: "CDE" });
		expect(await screen.findByRole("heading", { name: `${project.name} › Settings` })).toBeDefined();
		const main = screen.getByRole("main");
		expect(main.textContent).toMatch(/statuses/i);
		expect(main.textContent).toMatch(/subprojects/i);
		expect(main.textContent).toMatch(/\bkey\b/i);
	});

	// WS-88. The CLI line is the fastest way to a first ticket.
	test("an empty project shows the CLI empty state", async () => {
		const server = createFakeServer();
		await server.client.projects.create({ key: "DOC", name: "Docs" });
		renderApp({ path: "/p/DOC/table", actor: "navid", server });
		expect(await screen.findByText('trellis create -p DOC -t "First ticket"')).toBeDefined();
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
		const { server } = renderApp({ path: "/p/CDE/table", actor: "navid" });
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
		const { router } = renderApp({ path: "/p/CDE/web/auth/table", actor: "navid", server });
		await findGrid();
		await waitFor(() => expect(inputs(server, "tickets.list").length).toBeGreaterThan(0));
		expect(inputs(server, "tickets.list")[0]).toMatchObject({ project: "CDE.web.auth" });
		expect(router.state.location.pathname).toBe("/p/CDE/web/auth/table");
	});

	// Outcome 110. The grid element is the same node before and after.
	test("reruns the query on a filter change without remounting the table", async () => {
		const user = userEvent.setup();
		const { router, server } = renderApp({ path: "/p/CDE/table", actor: "navid" });
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
		renderApp({ path: "/p/CDE/table?status=human-review&peek=CDE-42", actor: "navid" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		expect(rowOf("CDE-42").getAttribute("tabindex")).toBe("0");
		expect(rowOf("CDE-42").hasAttribute("data-focused")).toBe(true);
		expect(rowOf("CDE-37").getAttribute("tabindex")).toBe("-1");
		expect(rowOf("CDE-37").hasAttribute("data-focused")).toBe(false);
	});

	// The peek opens here from the URL, so no element had the focus before
	// it opened. Escape still puts the focus on the row of the ticket that
	// the peek shows after a j step.
	test("Escape closes the peek with the focus on the row of the ticket it shows", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/table?status=human-review&peek=CDE-42", actor: "navid" });
		await findGrid();
		await screen.findByRole("dialog", { name: "CDE-42" });
		await user.keyboard("j");
		await waitFor(() => expect(router.state.location.search).not.toMatchObject({ peek: "CDE-42" }));
		const shown = (router.state.location.search as { peek: string }).peek;
		await screen.findByRole("dialog", { name: shown });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
		await waitFor(() => expect(document.activeElement).toBe(rowOf(shown)));
	});

	// The row of the shown ticket already has the table focus when the peek
	// closes, so the close changes no focus state of the table.
	test("Escape closes the peek with the focus on its row when that row had the focus before", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/table?status=human-review&peek=CDE-42", actor: "navid" });
		await findGrid();
		const panel = await screen.findByRole("dialog", { name: "CDE-42" });
		await waitFor(() => rowOf("CDE-42"));
		rowOf("CDE-42").focus();
		within(panel).getByRole("textbox", { name: "Title" }).focus();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
		await waitFor(() => expect(document.activeElement).toBe(rowOf("CDE-42")));
	});
});
