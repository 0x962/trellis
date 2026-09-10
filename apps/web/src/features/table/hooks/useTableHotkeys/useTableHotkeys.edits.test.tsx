import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../../test/fake-server";
import { renderApp } from "../../../../../test/renderWithProviders";
import { calls, findGrid, focusRow, inputs, press, queryRow, resetUi, rowOf } from "../../../../../test/table";
import { tableViewport } from "../../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

// In Progress: CDE-44, CDE-43, CDE-41, CDE-38. Agent Review: CDE-45, CDE-40.
const path = "/p/CDE?status=in-progress,agent-review";

const ready = async () => {
	const app = renderApp({ path, actor: "navid", server: createFakeServer() });
	await findGrid();
	await waitFor(() => rowOf("CDE-44"));
	return app;
};

const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp | string) => {
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByRole("option", { name }));
};

// The open trigger of a row's popover: the button in the column's cell, or,
// when the grouping hides that column, the row's anchor button that carries
// the column's name.
const openTrigger = (identifier: string, column: string) =>
	rowOf(identifier).querySelector(
		`[data-column="${column}"] [data-popup-open], [aria-label="${column[0]!.toUpperCase()}${column.slice(1)}"][data-popup-open]`,
	);

describe("features/table/hooks/useTableHotkeys: edits", () => {
	// Outcome 43
	test("opens the status and priority popovers for the focused row", async () => {
		await ready();
		focusRow("CDE-44");
		press("s");
		const status = await screen.findByRole("dialog");
		expect(within(status).getByRole("listbox")).toBeDefined();
		expect(within(status).getByRole("option", { name: "Human Review" })).toBeDefined();
		expect(openTrigger("CDE-44", "status")).not.toBeNull();
		press("Escape");
		await waitFor(() => expect(status.isConnected).toBe(false));
		await waitFor(() => expect(document.activeElement).toBe(rowOf("CDE-44")));
		press("p");
		const priority = await screen.findByRole("dialog");
		expect(within(priority).getByRole("option", { name: /urgent/i })).toBeDefined();
		expect(openTrigger("CDE-44", "priority")).not.toBeNull();
		expect(openTrigger("CDE-44", "status")).toBeNull();
	});

	// Outcome 44
	test("applies the status popover to the selection when rows are selected", async () => {
		const user = userEvent.setup();
		const { server } = await ready();
		focusRow("CDE-44");
		press("x");
		press("j", { shiftKey: true });
		press("j", { shiftKey: true });
		press("s");
		await pick(user, "Human Review");
		await waitFor(() => expect(calls(server, "tickets.updateMany")).toHaveLength(1));
		const input = inputs(server, "tickets.updateMany")[0] as { tickets: string[]; status: string };
		expect([...input.tickets].sort()).toEqual(["CDE-41", "CDE-43", "CDE-44"]);
		expect(input).toHaveProperty("status");
		expect(calls(server, "tickets.update")).toHaveLength(0);
	});

	// Outcome 45. A picker's search field is named for what it searches.
	test("opens the parent picker on Shift+P and the project picker on m", async () => {
		await ready();
		focusRow("CDE-44");
		press("P", { shiftKey: true });
		const parent = await screen.findByRole("dialog");
		expect(within(parent).getByRole("combobox", { name: /ticket/i })).toBeDefined();
		press("Escape");
		await waitFor(() => expect(parent.isConnected).toBe(false));
		await waitFor(() => expect(document.activeElement).toBe(rowOf("CDE-44")));
		press("m");
		const project = await screen.findByRole("dialog");
		expect(within(project).getByRole("combobox", { name: /project/i })).toBeDefined();
		expect(within(project).getByRole("option", { name: /host/ })).toBeDefined();
	});

	// Outcome 48
	test("deletes the focused row only after the confirm", async () => {
		const user = userEvent.setup();
		const { server } = await ready();
		focusRow("CDE-44");
		press("Backspace");
		const first = await screen.findByRole("dialog", { name: /delete/i });
		await user.click(within(first).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(first.isConnected).toBe(false));
		expect(calls(server, "tickets.delete")).toHaveLength(0);
		expect(queryRow("CDE-44")).not.toBeNull();
		await waitFor(() => expect(document.activeElement).toBe(rowOf("CDE-44")));
		press("Backspace");
		const second = await screen.findByRole("dialog", { name: /delete/i });
		await user.click(within(second).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(calls(server, "tickets.delete")).toHaveLength(1));
		expect(inputs(server, "tickets.delete")[0]).toMatchObject({ ticket: "CDE-44" });
		await waitFor(() => expect(queryRow("CDE-44")).toBeNull());
	});
});
