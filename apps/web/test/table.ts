import { fireEvent, screen, within } from "@testing-library/react";
import { toast } from "@trellis/ui";
import { closeComposer } from "../src/features/composer/composerStore";
import { createUiStore, useUiStore } from "../src/stores/uiStore";
import type { FakeServer } from "./fake-server";

// The DOM contract of the ticket table, as the tests read it:
// - the table is `role="grid"` with `aria-rowcount`; its scroll container
//   carries `data-table-viewport`, and the virtualizer's spacer
//   `data-table-body` with its height in `style.height`;
// - a row is `role="row"` with `data-identifier="CDE-42"`,
//   `data-group="<group key>"`, `aria-selected`, the roving `tabindex`, and
//   `data-focused` on the one row that holds the focus bar;
// - a cell is `role="gridcell"` with `data-column="<column id>"`; a header
//   is `role="columnheader"` with the same attribute;
// - a group header is `role="rowgroup"` with `data-group`, `aria-expanded`,
//   the count in `[data-count]`, a toggle button named after the group, and
//   a plus button named "New ticket in <group>";
// - the cap banner carries `data-cap-banner`;
// - the bulk bar is `role="toolbar"` named "Bulk actions";
// - a filter chip carries `data-filter-chip="<field>"`;
// - the table footer carries `data-table-footer`.

export const grid = () => screen.getByRole("grid");

export const findGrid = () => screen.findByRole("grid");

export const rows = () => within(grid()).getAllByRole("row");

export const identifiers = () => rows().map((row) => row.getAttribute("data-identifier"));

export const rowOf = (identifier: string) => {
	const row = document.querySelector<HTMLElement>(`[role="row"][data-identifier="${identifier}"]`);
	if (row === null) throw new Error(`No row for ${identifier}`);
	return row;
};

export const queryRow = (identifier: string) =>
	document.querySelector<HTMLElement>(`[role="row"][data-identifier="${identifier}"]`);

export const cellOf = (identifier: string, column: string) => {
	const cell = rowOf(identifier).querySelector<HTMLElement>(`[role="gridcell"][data-column="${column}"]`);
	if (cell === null) throw new Error(`No ${column} cell for ${identifier}`);
	return cell;
};

export const columnHeaders = () =>
	[...document.querySelectorAll('[role="columnheader"]')].map((header) => header.getAttribute("data-column"));

export const groupHeaders = () => within(grid()).getAllByRole("rowgroup");

export const groupHeader = (key: string) => {
	const header = document.querySelector<HTMLElement>(`[role="rowgroup"][data-group="${key}"]`);
	if (header === null) throw new Error(`No group header for ${key}`);
	return header;
};

export const queryGroupHeader = (key: string) =>
	document.querySelector<HTMLElement>(`[role="rowgroup"][data-group="${key}"]`);

export const groupRows = (key: string) => document.querySelectorAll(`[role="row"][data-group="${key}"]`);

export const groupCount = (key: string) => groupHeader(key).querySelector("[data-count]")!.textContent;

export const viewport = () => document.querySelector<HTMLElement>("[data-table-viewport]")!;

export const spacer = () => document.querySelector<HTMLElement>("[data-table-body]")!;

export const footer = () => document.querySelector<HTMLElement>("[data-table-footer]")!;

export const bulkBar = () => screen.getByRole("toolbar", { name: "Bulk actions" });

export const queryBulkBar = () => screen.queryByRole("toolbar", { name: "Bulk actions" });

export const filterBar = () => document.querySelector<HTMLElement>("[data-filter-bar]")!;

export const chip = (field: string) => document.querySelector<HTMLElement>(`[data-filter-chip="${field}"]`);

// Focuses a row. The table's hotkeys read keydown on the document, so a key
// pressed on the row bubbles to them.
export const focusRow = (identifier: string) => {
	const row = rowOf(identifier);
	row.focus();
	return row;
};

export const press = (key: string, init: KeyboardEventInit = {}) =>
	fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });

export const calls = (server: FakeServer, path: string) => server.calls.filter((call) => call.path.join(".") === path);

export const listCalls = (server: FakeServer) => calls(server, "tickets.list");

export const inputs = (server: FakeServer, path: string) =>
	calls(server, path).map((call) => call.input as Record<string, unknown>);

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The trellis-ui store as localStorage holds it.
export const storedUi = () => JSON.parse(localStorage.getItem("trellis-ui") ?? "{}").state ?? {};

// A clean slate for a table test: no stored preference and a fresh ui store.
export const resetUi = () => {
	localStorage.clear();
	sessionStorage.clear();
	toast.dismiss();
	closeComposer();
	useUiStore.setState(createUiStore().getState());
};

// The toast region and the toast that names `text`.
export const toastWith = async (text: RegExp | string) => {
	const match = await within(screen.getByRole("status")).findByText(text);
	return (match.closest("[data-sonner-toast]") ?? match.parentElement!.parentElement!) as HTMLElement;
};
