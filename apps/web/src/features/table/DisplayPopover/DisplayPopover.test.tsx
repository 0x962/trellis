import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";
import { findGrid, resetUi, rowOf, rows, storedUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";
import { useUiStore } from "../../../stores/uiStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const path = "/p/CDE?status=in-progress";

const cells = (column: string) => document.querySelectorAll(`[role="gridcell"][data-column="${column}"]`);

const open = async (user: ReturnType<typeof userEvent.setup>) => {
	const app = renderApp({ path, actor: "navid" });
	await findGrid();
	await waitFor(() => rowOf("CDE-44"));
	await user.click(screen.getByRole("button", { name: "Display" }));
	const popover = await screen.findByRole("dialog", { name: "Display" });
	return { ...app, popover };
};

const radio = (popover: HTMLElement, group: string, name: string) =>
	within(within(popover).getByRole("radiogroup", { name: group })).getByRole("radio", { name });

describe("features/table/DisplayPopover", () => {
	// Outcome 65
	test("hides a column and keeps the choice per route", async () => {
		const user = userEvent.setup();
		const first = await open(user);
		expect(cells("updated").length).toBeGreaterThan(0);
		await user.click(within(first.popover).getByRole("switch", { name: "Updated" }));
		await waitFor(() => expect(cells("updated")).toHaveLength(0));
		expect(storedUi().columnVisibility["/p/CDE"].updated).toBe(false);
		first.unmount();
		renderApp({ path, actor: "navid" });
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
		await user.click(radio(popover, "Group by", "Priority"));
		await user.click(radio(popover, "Sort by", "Created"));
		await waitFor(() =>
			expect(router.state.location.searchStr).toBe("?status=in-progress&sort=-createdAt&group=priority"),
		);
		await waitFor(() => expect(document.querySelector('[role="rowgroup"][data-group="urgent"]')).not.toBeNull());
		expect(document.querySelector('[role="rowgroup"][data-group="in-progress"]')).toBeNull();
		await user.click(radio(popover, "Group by", "Status"));
		await user.click(radio(popover, "Sort by", "Updated"));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress"));
	});
});
