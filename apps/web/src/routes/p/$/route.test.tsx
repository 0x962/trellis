import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errors } from "@trellis/api";
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
		await user.type(screen.getByRole("textbox", { name: "Ticket template" }), "## Outcome");
		await user.click(screen.getByRole("button", { name: "Save project" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "projects.update");
			expect(call?.input).toEqual({
				project: "CDE.web",
				name: "Web platform",
				slug: "web-platform",
				description: "Browser product work",
				ticketTemplate: "## Outcome",
			});
		});
	});

	test("Customize copies inherited statuses and Clear restores inheritance", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/web/settings", actor: "navid" });
		expect(await screen.findByText("Inherited from CDE")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Customize" }));
		await user.type(screen.getByRole("textbox", { name: "Status name" }), "Ready");
		await user.click(screen.getByRole("button", { name: "Add status" }));
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
		renderApp({ path: "/p/CDE/settings", actor: "navid", server });
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
		const { server } = renderApp({ path: "/p/CDE/settings", actor: "navid" });
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
		renderApp({ path: "/p/CDE/settings", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete In Progress" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete In Progress?" });
		await user.click(within(dialog).getByRole("button", { name: "Delete status" }));
		expect(await within(dialog).findByText(`${count} tickets use this status. Select a replacement.`)).toBeDefined();
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
		renderApp({ path: "/p/CDE/settings", actor: "navid", server });
		await user.click(await screen.findByRole("button", { name: "Delete Todo" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete Todo?" });
		await user.click(within(dialog).getByRole("button", { name: "Delete status" }));
		expect(await within(dialog).findByText(errors.LAST_STATUS.message)).toBeDefined();
	});

	test("the key field shows KEY_LOCKED after the first ticket", async () => {
		renderApp({ path: "/p/CDE/settings", actor: "navid" });
		const key = (await screen.findByRole("textbox", { name: "Key" })) as HTMLInputElement;
		expect(key.readOnly).toBe(true);
		expect(screen.getByText(errors.KEY_LOCKED.message)).toBeDefined();
	});

	test("repositories add and remove through projects.setRepos", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/p/CDE/web/settings", actor: "navid" });
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
