import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyEvent } from "@trellis/api";
import { summaryOf } from "../../../../test/events";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { matchStatus, patchTicket, statusesOf, ticketRow } from "../../../../test/rows";
import { createTestServer } from "../../../../test/server";
import { useUiStore } from "../../../stores/uiStore";
import { useComposerStore } from "../../composer/composerStore";
import { Board } from ".";

// The UI store keeps the collapsed columns in memory, so each test starts
// with none stored and gets the board's default rails.
beforeEach(() => {
	localStorage.clear();
	useUiStore.setState({ collapsedGroups: {} });
	useComposerStore.setState({ open: false, options: {} });
});

const renderBoard = (server = createTestServer()) =>
	renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
		path: "/p/CDE/board",
		actor: "navid",
		server,
	});

const column = (name: string) => screen.getByRole("list", { name: new RegExp(`^${name},`) });

const card = (identifier: string) => screen.getByRole("listitem", { name: new RegExp(`^${identifier} `) });

const identifiers = (list: HTMLElement) =>
	within(list)
		.getAllByRole("listitem")
		.map((item) => item.getAttribute("aria-label")!.split(" ")[0]!);

const drop = (source: HTMLElement, target: HTMLElement, edge?: "top" | "bottom") => {
	const dataTransfer = new DataTransfer();
	dataTransfer.setDragImage = () => {};
	const clientY = edge === "top" ? 0 : 10_000;
	document.elementFromPoint = () => target;
	document.elementsFromPoint = () => [target];
	fireEvent.dragStart(source, { dataTransfer, clientX: 1, clientY });
	fireEvent.dragEnter(target, { dataTransfer, clientX: 1, clientY });
	fireEvent.dragOver(target, { dataTransfer, clientX: 1, clientY });
	fireEvent.drop(target, { dataTransfer, clientX: 1, clientY });
	fireEvent.dragEnd(source, { dataTransfer, clientX: 1, clientY });
};

describe("Board", () => {
	test("the loading state mounts before auto-scroll attaches", async () => {
		const userAgent = navigator.userAgent;
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome" });
		try {
			renderBoard();
			expect(await screen.findByText("CDE-47")).toBeDefined();
		} finally {
			warning.mockRestore();
			Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
		}
	});

	test("columns use category order and show counts and the WIP warning", async () => {
		const server = createTestServer();
		const started = matchStatus(await statusesOf(server, "CDE"), "in-progress")!;
		await server.client.statuses.update({ project: "CDE", status: started.id, wipLimit: 3 });
		renderBoard(server);

		const columns = await screen.findAllByRole("list");
		expect(columns.map((entry) => entry.getAttribute("data-category"))).toEqual([
			"todo",
			"started",
			"review",
			"review",
			"done",
			"canceled",
		]);
		expect(column("Todo").getAttribute("aria-label")).toBe("Todo, 23 tickets");
		// The WIP badge sits in the column header, above the list that scrolls.
		const badge = within(column("In Progress").closest("section")!).getByText("4/3");
		expect(badge.getAttribute("data-state")).toBe("warning");
	});

	// The board matches the sort field of the table: the ticket that changed
	// last sits at the top of its column, and a tie breaks by id descending.
	test("a column lists the last updated card first", async () => {
		const server = createTestServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		const todo = matchStatus(await statusesOf(server, "CDE"), "todo")!;
		const page = await server.client.tickets.list({ project: "CDE", status: todo.id, sort: "-updatedAt", limit: 200 });
		const expected = page.items
			.sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1))
			.map((row) => row.identifier);
		expect(expected.length).toBeGreaterThan(1);
		expect(identifiers(column("Todo"))).toEqual(expected);
	});

	test("a drop between columns patches the cache before one move response", async () => {
		const server = createTestServer();
		let release = () => {};
		let blocked = false;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const serverFetch = server.fetch;
		server.fetch = async (request, init) => {
			if (blocked) await gate;
			return serverFetch(request, init);
		};
		const view = renderBoard(server);
		await screen.findByText("CDE-47");
		blocked = true;

		drop(card("CDE-47"), column("In Progress"));
		expect(within(column("In Progress")).getByText("CDE-47")).toBeDefined();
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.move")).toHaveLength(0);
		release();
		await waitFor(() => expect(server.calls.filter((call) => call.path.join(".") === "tickets.move")).toHaveLength(1));
		expect(server.calls.find((call) => call.path.join(".") === "tickets.move")!.actor).toBe("human:navid");
		view.unmount();
	});

	test("a 412 rolls the card back and shows a toast", async () => {
		const server = createTestServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		await server.client.tickets.update({ ticket: "CDE-47", title: "Changed elsewhere" });

		drop(card("CDE-47"), column("In Progress"));
		expect(within(column("In Progress")).getByText("CDE-47")).toBeDefined();
		await waitFor(() => expect(within(column("Todo")).getByText("CDE-47")).toBeDefined());
		expect(
			await screen.findByText("CDE-47 did not move to In Progress. Another actor changed the ticket first."),
		).toBeDefined();
	});

	// A column has no manual order, so a drop inside the card's own column
	// takes no drop target and writes nothing.
	test("a drop inside the card's own column changes nothing", async () => {
		const server = createTestServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		const before = identifiers(column("Todo"));
		drop(card("CDE-47"), card(before.find((identifier) => identifier !== "CDE-47")!), "bottom");
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Board drag status" }).textContent).toBe("Drop canceled"),
		);
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.move")).toHaveLength(0);
		expect(identifiers(column("Todo"))).toEqual(before);
	});

	test("brackets change columns and Shift with an arrow only moves the focus", async () => {
		const server = createTestServer();
		renderBoard(server);
		const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
		item.focus();
		fireEvent.keyDown(item, { key: "]" });
		await waitFor(() =>
			expect(
				server.calls.some(
					(call) =>
						call.path.join(".") === "tickets.move" && (call.input as { status?: string }).status === "in-progress",
				),
			).toBe(true),
		);
		const moves = server.calls.filter((call) => call.path.join(".") === "tickets.move").length;
		const moved = card("CDE-47");
		moved.focus();
		const before = identifiers(column("In Progress"));
		const below = before[before.indexOf("CDE-47") + 1]!;
		fireEvent.keyDown(moved, { key: "ArrowDown", shiftKey: true });
		expect(document.activeElement).toBe(card(below));
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.move")).toHaveLength(moves);
		expect(identifiers(column("In Progress"))).toEqual(before);
	});

	test("the live region announces pick up, move, and cancel", async () => {
		renderBoard();
		const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
		const dataTransfer = new DataTransfer();
		dataTransfer.setDragImage = () => {};
		document.elementsFromPoint = () => [item];
		fireEvent.dragStart(item, { dataTransfer });
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Board drag status" }).textContent).toContain(
				"CDE-47 picked up from Todo",
			),
		);
		fireEvent.dragEnd(item, { dataTransfer });
		expect(screen.getByRole("status", { name: "Board drag status" }).textContent).toBe("Drop canceled");
		drop(item, column("In Progress"));
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Board drag status" }).textContent).toContain("Moved to In Progress"),
		);
	});

	test("only the failing-CI card has a danger border", async () => {
		renderBoard();
		const failing = await screen.findByRole("listitem", { name: /^CDE-44 / });
		expect(failing.getAttribute("data-ci")).toBe("failing");
		expect(failing.className).toMatch(/border-t-danger/);
		expect(document.querySelectorAll('[data-ci="failing"]')).toHaveLength(1);
		expect(card("CDE-43").className).not.toMatch(/border-t-danger/);
	});

	test("a collapsed column stays collapsed after a remount", async () => {
		const server = createTestServer();
		const first = renderBoard(server);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Todo actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Collapse" }));
		expect(screen.getByRole("button", { name: "Expand Todo" })).toBeDefined();
		first.unmount();
		renderBoard(server);
		expect(await screen.findByRole("button", { name: "Expand Todo" })).toBeDefined();
	});

	test("Done shows 30 days until Show all done", async () => {
		const server = createTestServer();
		const created = await server.client.tickets.create({ project: "CDE", title: "Old completed ticket" });
		await server.client.tickets.move({ ticket: created.identifier, status: "done" });
		await patchTicket(server, created.identifier, {
			completedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
		});
		renderBoard(server);
		// Done starts as a rail at the end of the board.
		await userEvent.setup().click(await screen.findByRole("button", { name: "Expand Done" }));
		await screen.findByRole("list", { name: /^Done,/ });
		expect(screen.queryByText("Old completed ticket")).toBeNull();
		await userEvent.setup().click(screen.getByRole("button", { name: "Show all done tickets" }));
		expect(await screen.findByText("Old completed ticket")).toBeDefined();
	});

	test("the column header plus opens New ticket in the project and the column status", async () => {
		const server = createTestServer();
		renderBoard(server);
		await userEvent.setup().click(await screen.findByRole("button", { name: "New ticket in Todo" }));
		expect(useComposerStore.getState()).toMatchObject({ open: true, options: { project: "CDE", status: "todo" } });
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.create")).toHaveLength(0);
	});

	test("a ticket.updated event moves a card without a board refetch", async () => {
		const server = createTestServer();
		const view = renderBoard(server);
		await screen.findByText("CDE-47");
		const row = await ticketRow(server, "CDE-47");
		const target = matchStatus(await statusesOf(server, "CDE"), "in-progress")!;
		const summary = summaryOf({ ...row, status: target, version: row.version + 1 });
		const calls = server.calls.filter((call) => call.path.join(".") === "tickets.board").length;

		await act(async () => {
			applyEvent({ type: "ticket.updated", summary, fields: ["status"], batchId: row.id }, view.queryClient);
			await Promise.resolve();
		});

		await waitFor(() => expect(within(column("In Progress")).getByText("CDE-47")).toBeDefined());
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.board")).toHaveLength(calls);
	});
});
