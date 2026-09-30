import { afterEach, expect, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { usePageSheetStore } from "../../../stores/pageSheetStore";
import { type RowSelection, useRowSelection } from "../hooks/useRowSelection";
import { useRowActions } from "../TicketTable/useRowActions";
import { flattenGroups, type TableGroup } from "../utils/flattenGroups";
import { visibleRows } from "../utils/visibleRows";
import { Row } from "./Row";

const domTest = test.skipIf(typeof document === "undefined");
const noop = () => {};
const ticket = (id: string): TicketSummary => ({
	id,
	identifier: `TRL-${id}`,
	number: Number(id),
	title: `Ticket ${id}`,
	priority: "none",
	status: { id: "todo", slug: "todo", name: "Todo", category: "todo", color: "fg-muted" },
	project: { id: "project", key: "TRL" },
	labels: [],
	pr: null,
	prRows: [],
	parent: null,
	epic: null,
	wave: null,
	childCount: 0,
	childDoneCount: 0,
	ancestors: [],
	attachmentCount: 0,
	waitsOn: [],
	releases: [],
	ready: false,
	lastActor: null,
	position: Number(id),
	version: 1,
	createdAt: "2026-09-30T06:00:00.000Z",
	updatedAt: "2026-09-30T06:00:00.000Z",
	completedAt: null,
});
const group = (ids: string[], key = "all", expanded = true): TableGroup => ({
	key,
	label: null,
	rows: ids.map(ticket),
	count: ids.length,
	expanded,
});

let dispose = async () => {};
afterEach(async () => {
	await dispose();
	usePageSheetStore.setState({ ticket: null });
});

async function mount(groups = [group(["1", "2", "3", "4", "5"])], phone = false) {
	let selection: RowSelection;
	let changeGroups: (next: TableGroup[]) => void;
	function Harness() {
		const [view, setView] = useState(groups);
		changeGroups = setView;
		const rows = visibleRows(flattenGroups(view));
		selection = useRowSelection({ ids: rows.map((row) => row.id) });
		const actions = useRowActions({
			findTicket: (id) => rows.find((row) => row.id === id),
			selection,
			selectedTickets: () => rows.filter((row) => selection.isSelected(row.id)),
			applyChange: async () => {},
			bulk: { update: async () => {}, remove: async () => {}, confirmDialog: null },
			onEditing: noop,
			onBulkPicker: noop,
		});
		return rows.map((row) => (
			<Row
				key={row.id}
				ticket={row}
				columns={["select", "id", "title"]}
				phone={phone}
				selected={selection.isSelected(row.id)}
				selecting={selection.count > 0}
				onClick={actions.onRowClick}
				onToggleSelect={(id, range) => (range ? selection.extend(id) : selection.toggle(id))}
			/>
		));
	}
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory() });
	dispose = async () => {
		await act(async () => root.unmount());
		container.remove();
	};
	await act(async () => {
		await router.load();
		root.render(<RouterProvider router={router} />);
	});
	return {
		selected: () => selection.selected,
		view: (next: TableGroup[]) => act(async () => changeGroups(next)),
		clear: () => act(async () => selection.clear()),
		click: async (id: string, target: "checkbox" | "link", modifiers: MouseEventInit = {}) => {
			const selector = target === "checkbox" ? '[role="checkbox"]' : "[data-row-link]";
			const element = container.querySelector(`[data-identifier="TRL-${id}"] ${selector}`)!;
			expect(element).not.toBeNull();
			const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers });
			await act(async () => element.dispatchEvent(event));
			return event.defaultPrevented;
		},
	};
}

domTest("Shift checkbox clicks select an inclusive range and shorten it from the same anchor", async () => {
	const table = await mount();
	await table.click("2", "checkbox");
	await table.click("5", "checkbox", { shiftKey: true });
	expect(table.selected()).toEqual(["2", "3", "4", "5"]);
	await table.click("3", "checkbox", { shiftKey: true });
	expect(table.selected()).toEqual(["2", "3"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

domTest("Shift row clicks extend upward and retain earlier selections outside the range", async () => {
	const table = await mount();
	await table.click("1", "checkbox");
	await table.click("5", "checkbox");
	expect(await table.click("3", "link", { shiftKey: true })).toBe(true);
	expect(table.selected()).toEqual(["1", "3", "4", "5"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

domTest("a first Shift click sets the anchor and clear removes it", async () => {
	const table = await mount();
	await table.click("2", "link", { shiftKey: true });
	await table.click("4", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["2", "3", "4"]);
	await table.clear();
	await table.click("5", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["5"]);
});

domTest("ranges follow the current order and skip collapsed groups", async () => {
	const table = await mount([group(["5", "4"], "a"), group(["3"], "b", false), group(["2", "1"], "c")]);
	await table.click("4", "checkbox");
	await table.click("1", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["4", "2", "1"]);
	await table.view([group(["1", "2", "4", "5"])]);
	await table.click("5", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["4", "5"]);
});

domTest("a filtered anchor starts a new range at the next Shift click", async () => {
	const table = await mount();
	await table.click("1", "checkbox");
	await table.view([group(["2", "3", "4", "5"])]);
	await table.click("3", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["3"]);
	await table.click("5", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["3", "4", "5"]);
});

domTest("plain clicks toggle checkboxes and open row links", async () => {
	const table = await mount();
	await table.click("2", "checkbox");
	await table.click("2", "checkbox");
	expect(table.selected()).toEqual([]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
	expect(await table.click("3", "link")).toBe(true);
	expect(usePageSheetStore.getState().ticket).toBe("TRL-3");
});

domTest("Command, Control, Alt, and middle clicks keep native row link behavior", async () => {
	const table = await mount();
	for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { button: 1 }]) {
		expect(await table.click("3", "link", modifiers)).toBe(false);
	}
	expect(table.selected()).toEqual([]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

domTest("Shift row clicks select ranges in the narrow layout", async () => {
	const table = await mount(undefined, true);
	expect(await table.click("2", "link", { shiftKey: true })).toBe(true);
	await table.click("5", "link", { shiftKey: true });
	expect(table.selected()).toEqual(["2", "3", "4", "5"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});
