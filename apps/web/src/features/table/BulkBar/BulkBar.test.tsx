import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { interceptFetch, serverError } from "../../../../test/interceptFetch";
import { renderApp } from "../../../../test/renderWithProviders";
import {
	bulkBar,
	calls,
	findGrid,
	footer,
	grid,
	identifiers,
	inputs,
	press,
	queryBulkBar,
	queryRow,
	resetUi,
	rowOf,
	rows,
	sleep,
	toastWith,
} from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const actions = ["Status", "Priority", "Move to project", "Set parent", "Copy IDs", "Delete"];

// Selects the first `count` rows of the Todo group on /p/CDE with the keyboard.
const selectFirst = async (count: number, server: FakeServer = createFakeServer()) => {
	const app = renderApp({ path: "/p/CDE", actor: "navid", server });
	await findGrid();
	await waitFor(() => expect(rows().length).toBeGreaterThanOrEqual(count));
	rows()[0]!.focus();
	press("x");
	for (let step = 1; step < count; step += 1) press("j", { shiftKey: true });
	expect(bulkBar().textContent).toContain(`${count} selected`);
	return { ...app, selected: identifiers().slice(0, count) as string[] };
};

const action = (name: string) => within(bulkBar()).getByRole("button", { name });

const many = (server: FakeServer) => inputs(server, "tickets.updateMany");

const pickOption = async (user: ReturnType<typeof userEvent.setup>, name: RegExp | string) => {
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByRole("option", { name }));
};

describe("features/table/BulkBar", () => {
	// Outcome 58
	test("appears with the count and reveals the checkbox column on the first selection", async () => {
		renderApp({ path: "/p/CDE", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		expect(queryBulkBar()).toBeNull();
		expect(grid().hasAttribute("data-selecting")).toBe(false);
		rows()[0]!.focus();
		press("x");
		expect(bulkBar().textContent).toContain("1 selected");
		expect(grid().hasAttribute("data-selecting")).toBe(true);
		for (const row of rows()) {
			const checkbox = row.querySelector('[role="checkbox"]');
			expect(checkbox).not.toBeNull();
			expect(checkbox!.className).not.toMatch(/opacity-0/);
		}
		expect(
			within(bulkBar())
				.getAllByRole("button")
				.map((button) => button.textContent?.trim() || button.getAttribute("aria-label")),
		).toEqual([...actions, "Clear selection"]);
	});

	// Outcome 59. One request is one batch on the server.
	test("changes the status of the selection with one updateMany call", async () => {
		const user = userEvent.setup();
		const { server, selected } = await selectFirst(12);
		await user.click(action("Status"));
		await pickOption(user, "Done");
		await waitFor(() => expect(many(server)).toHaveLength(1));
		expect([...(many(server)[0]!.tickets as string[])].sort()).toEqual([...selected].sort());
		expect(many(server)[0]).toHaveProperty("status");
		expect(calls(server, "tickets.update")).toHaveLength(0);
	});

	// Outcome 60
	test("sends one updateMany call for a bulk priority, move, and parent change", async () => {
		const user = userEvent.setup();
		const { server, selected } = await selectFirst(12);
		await user.click(action("Priority"));
		await pickOption(user, /high/i);
		await waitFor(() => expect(many(server)).toHaveLength(1));
		expect(many(server)[0]).toMatchObject({ priority: "high" });
		await user.click(action("Move to project"));
		await pickOption(user, /host/);
		await waitFor(() => expect(many(server)).toHaveLength(2));
		expect(many(server)[1]).toMatchObject({ project: "CDE.host" });
		await user.click(action("Set parent"));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("combobox"));
		await user.keyboard("CDE-43");
		await waitFor(() => expect(within(dialog).getAllByRole("option")[0]!.textContent).toContain("CDE-43"));
		await user.keyboard("{Enter}");
		await waitFor(() => expect(many(server)).toHaveLength(3));
		expect(many(server)[2]).toMatchObject({ parent: "CDE-43" });
		for (const input of many(server)) expect([...(input.tickets as string[])].sort()).toEqual([...selected].sort());
	});

	// Outcome 61. Two tickets in a project of their own.
	test("copies the selected IDs one per line", async () => {
		const user = userEvent.setup();
		const server = createFakeServer({ empty: true });
		await server.client.projects.create({ key: "CDE", name: "Superset CDE" });
		await server.client.tickets.create({ project: "CDE", title: "First" });
		await server.client.tickets.create({ project: "CDE", title: "Second" });
		await selectFirst(2, server);
		await user.click(action("Copy IDs"));
		expect((await navigator.clipboard.readText()).split("\n").sort()).toEqual(["CDE-1", "CDE-2"]);
	});

	// Outcome 62
	test("deletes the selection with one deleteMany call after the confirm", async () => {
		const user = userEvent.setup();
		const { server, selected } = await selectFirst(3);
		await user.click(action("Delete"));
		const first = await screen.findByRole("dialog", { name: /delete 3 tickets/i });
		await user.click(within(first).getByRole("button", { name: "Cancel" }));
		await sleep(50);
		expect(calls(server, "tickets.deleteMany")).toHaveLength(0);
		expect(bulkBar().textContent).toContain("3 selected");
		await user.click(action("Delete"));
		const second = await screen.findByRole("dialog", { name: /delete 3 tickets/i });
		await user.click(within(second).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(calls(server, "tickets.deleteMany")).toHaveLength(1));
		const input = inputs(server, "tickets.deleteMany")[0] as { tickets: string[] };
		expect([...input.tickets].sort()).toEqual([...selected].sort());
		await waitFor(() => expect(selected.map(queryRow)).toEqual([null, null, null]));
	});

	// Outcome 63
	test("rolls every row back and toasts once when the batch fails", async () => {
		const user = userEvent.setup();
		const failing = interceptFetch(createFakeServer(), {
			match: (text) => text.includes("tickets/updateMany"),
			respond: serverError,
		});
		const { selected } = await selectFirst(3, failing.server);
		// The status grouping hides the status column, so the row's group is
		// its status.
		const original = selected.map((identifier) => rowOf(identifier).getAttribute("data-group"));
		await user.click(action("Status"));
		await pickOption(user, "Done");
		const toast = await toastWith(/retry/i);
		expect(within(toast).getByRole("button", { name: "Retry" })).toBeDefined();
		await waitFor(() => {
			for (const [index, identifier] of selected.entries()) {
				expect(rowOf(identifier).getAttribute("data-group")).toBe(original[index]!);
			}
		});
		expect(within(screen.getByRole("status")).getAllByRole("button", { name: "Retry" })).toHaveLength(1);
	});

	// Outcome 64
	test("reaches every bulk action by keyboard and clears on Esc", async () => {
		const user = userEvent.setup();
		const { selected } = await selectFirst(3);
		const buttons = actions.map(action);
		buttons[0]!.focus();
		for (const button of buttons) {
			expect(document.activeElement).toBe(button);
			await user.tab();
		}
		buttons[2]!.focus();
		press("Escape");
		expect(queryBulkBar()).toBeNull();
		for (const identifier of selected) expect(rowOf(identifier).getAttribute("aria-selected")).toBe("false");
	});

	// T4. The bar centers on the list column, so it never covers the sidebar.
	test("sits inside the table column, not fixed to the window", async () => {
		await selectFirst(1);
		expect(bulkBar().className).toMatch(/\babsolute\b/);
		expect(bulkBar().className).not.toMatch(/\bfixed\b/);
		expect(bulkBar().closest("[data-ticket-table]")).not.toBeNull();
	});

	// T4. The bar holds the count, so the footer does not repeat it.
	test("the footer drops the selected count while the bar shows", async () => {
		await selectFirst(2);
		expect(bulkBar().textContent).toContain("2 selected");
		expect(footer().textContent).not.toMatch(/selected/);
	});

	test("the Clear selection button clears the selection", async () => {
		const user = userEvent.setup();
		const { selected } = await selectFirst(2);
		await user.click(within(bulkBar()).getByRole("button", { name: "Clear selection" }));
		expect(queryBulkBar()).toBeNull();
		for (const identifier of selected) expect(rowOf(identifier).getAttribute("aria-selected")).toBe("false");
	});

	test("Cmd+C with a selection copies every selected ID", async () => {
		const { selected } = await selectFirst(3);
		press("c", { metaKey: true });
		await waitFor(async () =>
			expect((await navigator.clipboard.readText()).split("\n").sort()).toEqual([...selected].sort()),
		);
	});

	test("Backspace with a selection asks to delete the whole selection", async () => {
		await selectFirst(3);
		press("Backspace");
		expect(await screen.findByRole("dialog", { name: /delete 3 tickets/i })).toBeDefined();
	});

	// TB-2. The toast matches the count.
	test("Copy IDs on one ticket says Copied 1 ID", async () => {
		const user = userEvent.setup();
		await selectFirst(1);
		await user.click(action("Copy IDs"));
		expect(await toastWith(/^Copied 1 ID$/)).toBeDefined();
	});

	// T4. Each action names its key in a Tooltip.
	test("an action shows its key in a Tooltip on hover", async () => {
		const user = userEvent.setup();
		await selectFirst(1);
		await user.hover(action("Status"));
		const tooltip = await screen.findByRole("tooltip");
		expect(tooltip.querySelector("kbd")?.textContent).toBe("s");
	});
});
