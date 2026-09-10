import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { mockClipboard } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
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
	// WS-98
	test("the tree renders roots with key badges and counts and sub-projects indented 16 px", async () => {
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid" });
		await screen.findByRole("link", { name: /Superset CDE/ });
		const links = screen.getAllByRole("link");
		const rows: Array<[string | null, string, string]> = [
			["CDE", "Superset CDE", "31"],
			[null, "web", "12"],
			[null, "host", "7"],
			["TRL", "trellis", "14"],
			["MRG", "margin", "3"],
		];
		expect(links).toHaveLength(rows.length);
		for (const [index, [key, name, count]] of rows.entries()) {
			const row = links[index]!;
			expect(within(row).getByText(name), name).toBeDefined();
			expect(within(row).getByText(count), name).toBeDefined();
			if (key === null) expect(within(row).queryByText(/^[A-Z][A-Z0-9]{1,9}$/), name).toBeNull();
			else expect(within(row).getByText(key), name).toBeDefined();
		}
		for (const [name, key, count] of [
			["Superset CDE", "CDE", "31"],
			["trellis", "TRL", "14"],
			["margin", "MRG", "3"],
		]) {
			const row = rootRow(name!);
			const badge = within(row).getByText(key!);
			expect(badge.className).toMatch(/\bfont-mono\b/);
			expect(within(row).getByText(count!).className).toMatch(/\btabular\b/);
			expect(row.className).not.toMatch(/\bpl-4\b/);
		}
		for (const [name, count] of [
			["web", "12"],
			["host", "7"],
		]) {
			const row = screen.getByRole("link", { name: new RegExp(`^${name}`) });
			expect(within(row).getByText(count!).className).toMatch(/\btabular\b/);
			expect(within(row).queryByText("CDE")).toBeNull();
			expect(row.className).toMatch(/\bpl-4\b/);
			expect(row.className).toMatch(/\bh-7\b/);
		}
	});

	// WS-99. The chevron is a button beside the row link, so the row still
	// navigates and the tree still toggles from the keyboard.
	test("expansion toggles from the chevron and persists", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const cde = (await server.client.projects.list({})).find((project) => project.path === "CDE")!;
		useUiStore.setState({ expandedProjects: { [cde.id]: false } });
		const first = renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid", server });
		await screen.findByRole("link", { name: /Superset CDE/ });
		expect(screen.queryByRole("link", { name: /^web/ })).toBeNull();
		const chevron = screen.getByRole("button", { name: /Expand Superset CDE/ });
		expect(chevron.getAttribute("aria-expanded")).toBe("false");
		await user.click(chevron);
		expect(await screen.findByRole("link", { name: /^web/ })).toBeDefined();
		expect(screen.getByRole("link", { name: /^host/ })).toBeDefined();
		const collapse = screen.getByRole("button", { name: /Collapse Superset CDE/ });
		expect(collapse.getAttribute("aria-expanded")).toBe("true");
		expect(useUiStore.getState().expandedProjects[cde.id]).toBe(true);
		expect(JSON.parse(localStorage.getItem("trellis-ui")!).state.expandedProjects[cde.id]).toBe(true);
		first.unmount();
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid", server });
		expect(await screen.findByRole("link", { name: /^web/ })).toBeDefined();
	});

	// WS-100
	test("the active project row is marked and its ancestors open", async () => {
		const server = createFakeServer();
		const cde = (await server.client.projects.list({})).find((project) => project.path === "CDE")!;
		useUiStore.setState({ expandedProjects: { [cde.id]: false } });
		renderWithProviders(<ProjectTree />, { path: "/p/CDE/web", actor: "navid", server });
		const web = await screen.findByRole("link", { name: /^web/ });
		expect(web.getAttribute("aria-current")).toBe("page");
		expect(rootRow("Superset CDE").getAttribute("aria-current")).toBeNull();
		expect(screen.getByRole("button", { name: /Collapse Superset CDE/ }).getAttribute("aria-expanded")).toBe("true");
	});

	// WS-101
	test("clicking a project row navigates to its slash path", async () => {
		const user = userEvent.setup();
		const { router } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid" });
		const root = await screen.findByRole("link", { name: /Superset CDE/ });
		expect(root.getAttribute("href")).toBe("/p/CDE");
		await user.click(root);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE"));
		const web = screen.getByRole("link", { name: /^web/ });
		expect(web.getAttribute("href")).toBe("/p/CDE/web");
		await user.click(web);
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/CDE/web"));
	});

	// WS-102. A refetch replaces numbers in place. No skeleton and no row
	// height change, so the sidebar never jumps while counts update.
	test("counts update in place without a skeleton", async () => {
		const server = createFakeServer();
		const { queryClient, orpc } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid", server });
		const web = await screen.findByRole("link", { name: /^web/ });
		expect(within(web).getByText("12")).toBeDefined();
		await server.client.tickets.create({ project: "CDE.web", title: "One more" });
		await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
		expect(document.querySelector("[aria-busy=true]")).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(5);
		await within(web).findByText("13");
		expect(within(rootRow("Superset CDE")).getByText("32")).toBeDefined();
		expect(document.querySelector("[aria-busy=true]")).toBeNull();
		for (const row of screen.getAllByRole("link")) {
			expect(row.className).toMatch(/\bh-7\b/);
		}
	});

	test("the project row menu opens tickets, settings, and the CLI filter", async () => {
		const user = userEvent.setup();
		const clipboard = mockClipboard();
		const { router } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid" });
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
		const { server } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "navid" });
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
