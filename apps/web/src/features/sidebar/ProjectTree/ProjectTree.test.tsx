import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockClipboard } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { createUiStore, useUiStore } from "../../../stores/uiStore";
import { useComposerStore } from "../../composer";
import { ProjectTree } from "./ProjectTree";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
	useComposerStore.setState({ open: false, options: {} });
});

const rootRow = (name: string) => screen.getByRole("link", { name: new RegExp(name) });

describe("features/sidebar/ProjectTree", () => {
	test("every project has Tickets and Settings pages with the selected page marked", async () => {
		const user = userEvent.setup();
		const { router } = renderWithProviders(<ProjectTree />, { path: "/p/TRL", actor: "dana" });
		for (const [name, path] of [
			["Cloud Desktop", "CDE"],
			["web", "CDE/web"],
			["host", "CDE/host"],
			["trellis", "TRL"],
		]) {
			const pages = await screen.findByRole("navigation", { name: `${name} pages` });
			expect(within(pages).getByRole("link", { name: "Tickets" }).getAttribute("href")).toBe(`/p/${path}`);
			expect(within(pages).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(`/p/${path}/settings`);
		}
		const pages = screen.getByRole("navigation", { name: "trellis pages" });
		const tickets = within(pages).getByRole("link", { name: "Tickets" });
		const settings = within(pages).getByRole("link", { name: "Settings" });
		expect(tickets.getAttribute("aria-current")).toBe("page");
		expect(rootRow("trellis").closest("li")!.classList.contains("sidebar-selected")).toBe(false);
		await user.click(settings);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/TRL/settings"));
		expect(settings.getAttribute("aria-current")).toBe("page");
		expect(tickets.getAttribute("aria-current")).toBeNull();
	});

	test("a project without children can collapse and restore its pages", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "Collapse trellis" }));
		expect(screen.queryByRole("navigation", { name: "trellis pages" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Expand trellis" }));
		expect(screen.getByRole("navigation", { name: "trellis pages" })).toBeDefined();
	});

	test("project links show names without project codes or counts and indent children", async () => {
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await screen.findByRole("link", { name: /Cloud Desktop/ });
		const links = screen
			.getAllByRole("link")
			.filter((link) => !["Tickets", "Manager", "Settings"].includes(link.textContent!));
		const names = ["Cloud Desktop", "web", "host", "trellis"];
		expect(links.map((link) => link.textContent)).toEqual(names);
		for (const [index, name] of names.entries()) {
			const row = links[index]!;
			expect(within(row).getByText(name)).toBeDefined();
			expect(row.closest("li")!.classList.contains(index === 1 || index === 2 ? "pl-5" : "pl-1")).toBe(true);
			expect(row.className).toMatch(/\bh-7\b/);
		}
	});

	test("every row keeps a 16 px indent and a shared leading slot, with a separate disclosure button", async () => {
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await screen.findByRole("link", { name: /Cloud Desktop/ });
		const rowOf = (name: RegExp) => screen.getByRole("link", { name }).closest("li")!;
		const slot = (row: Element, name: string) => row.querySelector(`[data-slot="${name}"]`)!;
		for (const [name, indent] of [
			[/Cloud Desktop/, "pl-1"],
			[/^web/, "pl-5"],
			[/^host/, "pl-5"],
			[/trellis/, "pl-1"],
		] as const) {
			const row = rowOf(name);
			expect(row.className).toMatch(new RegExp(`\\b${indent}\\b`));
			expect(row.className).toMatch(/\bsidebar-row\b/);
			expect(slot(row, "disclosure").className).toMatch(/\bsize-5\b/);
			expect(slot(row, "leading").classList.contains("sidebar-leading")).toBe(true);
			expect(slot(row, "trailing").classList.contains("sidebar-trailing")).toBe(true);
		}
		const chevron = screen.getByRole("button", { name: /Collapse Cloud Desktop/ });
		expect(slot(rowOf(/Cloud Desktop/), "disclosure").contains(chevron)).toBe(true);
		expect(chevron.classList.contains("absolute")).toBe(false);
		expect(slot(rowOf(/^web/), "disclosure").querySelector("button")).not.toBeNull();
		const dot = slot(rowOf(/^web/), "leading").querySelector("span")!;
		expect(dot.className).toMatch(/\bsize-1\.5\b/);
		expect(dot.className).toMatch(/\brounded-sm\b/);
		expect(dot.className).toMatch(/\bbg-fg-faint\b/);
	});

	// The guide connects each subtree to the centre of its parent's chevron.
	test("an open subtree draws a guide line under the parent's chevron", async () => {
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		const web = await screen.findByRole("link", { name: /^web/ });
		const subtree = web.closest("ul")!;
		expect(subtree.getAttribute("aria-label")).toBeNull();
		for (const name of [
			"before:absolute",
			"before:inset-y-0.5",
			"before:left-3.5",
			"before:w-px",
			"before:bg-border",
		]) {
			expect(subtree.classList.contains(name)).toBe(true);
		}
	});

	test("the project menu has a reserved trailing slot and appears on hover or focus", async () => {
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		const actions = await screen.findByRole("button", { name: "Actions for web" });
		const row = screen.getByRole("link", { name: /^web/ }).closest("li")!;
		const trailing = row.querySelector<HTMLElement>('[data-slot="trailing"]')!;
		expect(trailing.classList.contains("sidebar-trailing")).toBe(true);
		const menu = actions.closest("[data-slot=menu]")!;
		expect(row.contains(menu)).toBe(true);
		for (const name of ["absolute", "right-1", "size-6"]) expect(menu.classList.contains(name)).toBe(true);
		for (const name of ["opacity-0", "group-hover/row:opacity-100", "group-focus-within/row:opacity-100"]) {
			expect(menu.classList.contains(name)).toBe(true);
		}
		expect(trailing.textContent).toBe("");
		expect(row.className).toMatch(/\bsidebar-row\b/);
		expect(row.className).not.toMatch(/\bpr-9\b/);
	});

	// WS-99. The chevron is a button beside the row link, so the row still
	// navigates and the tree still toggles from the keyboard.
	test("expansion toggles from the chevron and persists", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const cde = (await server.client.projects.list({})).find((project) => project.path === "CDE")!;
		useUiStore.setState({ expandedProjects: { [cde.id]: false } });
		const first = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana", server });
		await screen.findByRole("link", { name: /Cloud Desktop/ });
		expect(screen.queryByRole("link", { name: /^web/ })).toBeNull();
		const chevron = screen.getByRole("button", { name: /Expand Cloud Desktop/ });
		expect(chevron.getAttribute("aria-expanded")).toBe("false");
		await user.click(chevron);
		expect(await screen.findByRole("link", { name: /^web/ })).toBeDefined();
		expect(screen.getByRole("link", { name: /^host/ })).toBeDefined();
		const collapse = screen.getByRole("button", { name: /Collapse Cloud Desktop/ });
		expect(collapse.getAttribute("aria-expanded")).toBe("true");
		expect(useUiStore.getState().expandedProjects[cde.id]).toBe(true);
		expect(JSON.parse(localStorage.getItem("trellis-ui")!).state.expandedProjects[cde.id]).toBe(true);
		first.unmount();
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana", server });
		expect(await screen.findByRole("link", { name: /^web/ })).toBeDefined();
	});

	// WS-100
	test("the active project row is marked and its ancestors open", async () => {
		const server = createTestServer();
		const cde = (await server.client.projects.list({})).find((project) => project.path === "CDE")!;
		useUiStore.setState({ expandedProjects: { [cde.id]: false } });
		renderWithProviders(<ProjectTree />, { path: "/p/CDE/web", actor: "dana", server });
		const web = await screen.findByRole("link", { name: /^web/ });
		const tickets = within(screen.getByRole("navigation", { name: "web pages" })).getByRole("link", {
			name: "Tickets",
		});
		expect(tickets.getAttribute("aria-current")).toBe("page");
		expect(tickets.className).toMatch(/\bsidebar-selected\b/);
		expect(web.textContent).toBe("web");
		expect(rootRow("Cloud Desktop").getAttribute("aria-current")).toBeNull();
		expect(screen.getByRole("button", { name: /Collapse Cloud Desktop/ }).getAttribute("aria-expanded")).toBe("true");
	});

	// WS-101
	test("clicking a project row navigates to its slash path", async () => {
		const user = userEvent.setup();
		const { router } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		const root = await screen.findByRole("link", { name: /Cloud Desktop/ });
		expect(root.getAttribute("href")).toBe("/p/CDE");
		await user.click(root);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE"));
		const web = screen.getByRole("link", { name: /^web/ });
		expect(web.getAttribute("href")).toBe("/p/CDE/web");
		await user.click(web);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/web"));
	});

	// WS-102. A refetch replaces the rows in place. No skeleton and no row
	// height change, so the sidebar never jumps while the tree updates.
	test("a project refetch keeps names and rows stable after a ticket is created", async () => {
		const server = createTestServer();
		const { queryClient, orpc } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana", server });
		const web = await screen.findByRole("link", { name: /^web/ });
		expect(web.textContent).toBe("web");
		await server.client.tickets.create({ project: "CDE.web", title: "One more" });
		await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
		expect(document.querySelector("[aria-busy=true]")).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(16);
		expect(screen.getByRole("link", { name: /^web/ })).toBe(web);
		expect(web.textContent).toBe("web");
		expect(rootRow("Cloud Desktop").textContent).toBe("Cloud Desktop");
		expect(document.querySelector("[aria-busy=true]")).toBeNull();
		// Every row of the tree, a project or one of its pages, is one height.
		for (const row of screen.getAllByRole("link")) {
			expect(row.className).toMatch(/\b(h-7|sidebar-row)\b/);
		}
	});

	test("the project row menu opens tickets, settings, and the CLI filter", async () => {
		const user = userEvent.setup();
		const clipboard = mockClipboard();
		const { router } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		const actions = await screen.findByRole("button", { name: "Actions for web" });
		await user.click(actions);
		for (const label of ["New sub-project", "New ticket", "Settings", "Copy CLI filter"]) {
			expect(screen.getByRole("menuitem", { name: label })).toBeDefined();
		}
		await user.click(screen.getByRole("menuitem", { name: "New ticket" }));
		expect(useComposerStore.getState()).toEqual({ open: true, options: { project: "CDE.web" } });
		await user.click(actions);
		await user.click(screen.getByRole("menuitem", { name: "Copy CLI filter" }));
		expect(clipboard.written).toEqual(["trellis list --project CDE.web"]);
		await user.click(actions);
		await user.click(screen.getByRole("menuitem", { name: "Settings" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/web/settings"));
	});

	test("New sub-project creates a child under the selected row", async () => {
		const user = userEvent.setup();
		const { server } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "Actions for web" }));
		await user.click(screen.getByRole("menuitem", { name: "New sub-project" }));
		const dialog = await screen.findByRole("dialog", { name: "New sub-project under web" });
		await user.type(within(dialog).getByRole("textbox", { name: "Project name" }), "API");
		await user.type(within(dialog).getByRole("textbox", { name: "Slug" }), "api");
		await user.click(within(dialog).getByRole("button", { name: "Create sub-project" }));
		await waitFor(() => {
			const call = server.calls.find((entry) => entry.path.join(".") === "projects.create");
			expect(call?.input).toEqual({ parent: "CDE.web", name: "API", slug: "api" });
		});
	});
});
