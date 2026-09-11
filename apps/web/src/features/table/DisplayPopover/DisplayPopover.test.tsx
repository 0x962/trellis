import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";
import { findGrid, footer, resetUi, rowOf, rows, storedUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";
import { useUiStore } from "../../../stores/uiStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const path = "/p/CDE/table?status=in-progress";

const cells = (column: string) => document.querySelectorAll(`[role="gridcell"][data-column="${column}"]`);

const open = async (user: ReturnType<typeof userEvent.setup>) => {
	const app = renderApp({ path, actor: "dana" });
	await findGrid();
	await waitFor(() => rowOf("CDE-44"));
	await user.click(screen.getByRole("button", { name: "Display" }));
	const popover = await screen.findByRole("dialog", { name: "Display" });
	return { ...app, popover };
};

const radio = (popover: HTMLElement, group: string, name: string) =>
	within(within(popover).getByRole("radiogroup", { name: group })).getByRole("radio", { name });

// Picks `name` in the Display Select labeled `label`.
const choose = async (user: ReturnType<typeof userEvent.setup>, popover: HTMLElement, label: string, name: string) => {
	await user.click(within(popover).getByRole("combobox", { name: label }));
	await user.click(await screen.findByRole("option", { name }));
};

describe("features/table/DisplayPopover", () => {
	// Outcome 65
	test("hides a column and keeps the choice per route", async () => {
		const user = userEvent.setup();
		const first = await open(user);
		expect(cells("updated").length).toBeGreaterThan(0);
		const chip = within(first.popover).getByRole("button", { name: "Updated" });
		expect(chip.getAttribute("aria-pressed")).toBe("true");
		await user.click(chip);
		expect(chip.getAttribute("aria-pressed")).toBe("false");
		await waitFor(() => expect(cells("updated")).toHaveLength(0));
		expect(storedUi().columnVisibility["/p/CDE"].updated).toBe(false);
		first.unmount();
		renderApp({ path, actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		expect(cells("updated")).toHaveLength(0);
		expect(cells("id").length).toBeGreaterThan(0);
	});

	// Outcome 66. The default density stays out of the URL.
	test("switches the density and writes it to the URL only when chosen", async () => {
		const user = userEvent.setup();
		const { popover, router } = await open(user);
		expect(rows()[0]!.style.height).toBe("36px");
		expect(router.state.location.searchStr).toBe("?status=in-progress");
		await user.click(radio(popover, "Density", "Compact"));
		await waitFor(() => expect(rows()[0]!.style.height).toBe("32px"));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress&density=compact"));
		expect(useUiStore.getState().density).toBe("compact");
		expect(storedUi().density).toBe("compact");
	});

	// Outcome 67
	test("writes the group and sort choices to the URL and omits the defaults", async () => {
		const user = userEvent.setup();
		const { popover, router } = await open(user);
		await choose(user, popover, "Group by", "Priority");
		await choose(user, popover, "Sort by", "Created");
		await waitFor(() =>
			expect(router.state.location.searchStr).toBe("?status=in-progress&sort=-createdAt&group=priority"),
		);
		await waitFor(() => expect(document.querySelector('[role="rowgroup"][data-group="urgent"]')).not.toBeNull());
		expect(document.querySelector('[role="rowgroup"][data-group="in-progress"]')).toBeNull();
		await choose(user, popover, "Group by", "Status");
		await choose(user, popover, "Sort by", "Updated");
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
	});

	// FL-1. The direction button flips the sort and keeps the field.
	test("flips the sort direction from its button", async () => {
		const user = userEvent.setup();
		const { popover, router } = await open(user);
		await user.click(within(popover).getByRole("button", { name: "Sort direction" }));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress&sort=updatedAt"));
		await user.click(within(popover).getByRole("button", { name: "Sort direction" }));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
	});

	// FL-1. Show completed off drops the Done and Canceled groups, and the
	// footer names the tickets it leaves out.
	test("hides the completed groups when Show completed is off", async () => {
		const user = userEvent.setup();
		const app = renderApp({ path: "/p/CDE/table", actor: "dana" });
		await findGrid();
		await waitFor(() => expect(document.querySelector('[role="rowgroup"][data-group="done"]')).not.toBeNull());
		await user.click(screen.getByRole("button", { name: "Display" }));
		const popover = await screen.findByRole("dialog", { name: "Display" });
		const toggle = within(popover).getByRole("switch", { name: "Show completed" });
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		await user.click(toggle);
		await waitFor(() => expect(app.router.state.location.searchStr).toBe("?closed=hide"));
		await waitFor(() => expect(document.querySelector('[role="rowgroup"][data-group="done"]')).toBeNull());
		expect(document.querySelector('[role="rowgroup"][data-group="canceled"]')).toBeNull();
		await waitFor(() => expect(footer().textContent).toMatch(/\d+ open · 21 completed hidden/));
	});
});
