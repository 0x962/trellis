import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import { chip, filterBar, findGrid, inputs, press, resetUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const chipText = (field: string) => chip(field)!.textContent!.replace(/\s+/g, " ").trim();

const option = async (name: RegExp | string) => {
	const dialog = await screen.findByRole("dialog");
	return within(dialog).getByRole("option", { name });
};

describe("features/filters/FilterBar", () => {
	// Outcome 76
	test("adds a status chip through the field and value pickers", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		press("f");
		await user.click(await option("Status"));
		await user.click(await option("In Progress"));
		await user.click(await option("Agent Review"));
		press("Escape");
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress,agent-review"));
		await waitFor(() => expect(chipText("status")).toBe("Status is In Progress, Agent Review"));
	});

	// Outcome 79. The presets are the first section of the field picker.
	test("applies a preset from the first section of the filter picker", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		await user.click(within(filterBar()).getByRole("button", { name: "Filter" }));
		const dialog = await screen.findByRole("dialog");
		const options = within(dialog)
			.getAllByRole("option")
			.map((entry) => entry.textContent?.trim());
		expect(options.slice(0, 4)).toEqual([
			"Active",
			"Needs review",
			"Failing checks",
			"Updated by agents, last 24 hours",
		]);
		await user.click(await option("Failing checks"));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?ci=fail"));
		await waitFor(() => expect(chipText("ci")).toBe("PR is failed"));
		expect(document.querySelectorAll("[data-filter-chip]")).toHaveLength(1);
	});

	// Outcome 80
	test("toggles the sub-projects scope from the project chip", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.projects.create({ parent: "CDE.web", name: "auth" });
		const { router } = renderApp({ path: "/p/CDE/web/table?scope=self", actor: "navid", server });
		await findGrid();
		await waitFor(() => expect(inputs(server, "tickets.list").at(-1)).toMatchObject({ subprojects: false }));
		await user.click(screen.getByRole("button", { name: /sub-projects/i }));
		await waitFor(() => expect(router.state.location.searchStr).toBe(""));
		await waitFor(() => expect(inputs(server, "tickets.list").at(-1)).not.toMatchObject({ subprojects: false }));
		expect(inputs(server, "tickets.list").at(-1)).toMatchObject({ project: "CDE.web" });
	});

	// Outcome 81. The route drops the default sort from the URL; the command
	// states it. Filter and Display are the only text buttons, so the copy
	// actions sit in the Share menu.
	test("copies the CLI command and the link from the Share menu", async () => {
		const user = userEvent.setup();
		renderApp({
			path: "/p/CDE/table?status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt",
			actor: "navid",
		});
		await findGrid();
		expect(within(filterBar()).queryByRole("button", { name: "Copy as CLI" })).toBeNull();
		await user.click(within(filterBar()).getByRole("button", { name: "Share" }));
		await user.click(await screen.findByRole("menuitem", { name: "Copy as CLI" }));
		expect(await navigator.clipboard.readText()).toBe(
			"trellis list --project CDE --status in-progress,agent-review --parent none --ci fail --sort -updatedAt",
		);
		await user.click(within(filterBar()).getByRole("button", { name: "Share" }));
		await user.click(await screen.findByRole("menuitem", { name: "Copy link" }));
		expect(await navigator.clipboard.readText()).toBe(
			"http://trellis.local/p/CDE/table?status=in-progress,agent-review&parent=none&ci=fail",
		);
	});

	// Outcome 82. The priority list starts at none; one arrow down is urgent.
	test("builds a filter with the keyboard alone", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		press("g");
		press("s");
		expect(document.activeElement).toBe(within(filterBar()).getByRole("button", { name: "Filter" }));
		await user.keyboard("{Enter}");
		const fields = await screen.findByRole("dialog");
		await user.keyboard("Priority");
		await waitFor(() => expect(within(fields).getAllByRole("option")).toHaveLength(1));
		await user.keyboard("{Enter}");
		await waitFor(() => expect(screen.getByRole("dialog").textContent).toMatch(/urgent/i));
		await user.keyboard("{ArrowDown}{Enter}");
		await waitFor(() => expect(router.state.location.searchStr).toBe("?priority=urgent"));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(chipText("priority")).toBe("Priority is Urgent");
	});
});
