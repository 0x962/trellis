import { beforeEach, describe, expect, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyEvent } from "@trellis/api";
import { createFakeServer } from "../../../../test/fake-server";
import { findTicket, matchStatus } from "../../../../test/fake-server/state";
import { ticketSummary } from "../../../../test/fake-server/summaries";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Board } from ".";

beforeEach(() => localStorage.clear());

const renderBoard = (server = createFakeServer()) =>
	renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
		path: "/p/CDE/board",
		actor: "navid",
		server,
	});

const column = (name: string) => screen.getByRole("list", { name: new RegExp(`^${name},`) });

const card = (identifier: string) => screen.getByRole("listitem", { name: new RegExp(`^${identifier} `) });

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
	test("columns use category order and show counts and the WIP warning", async () => {
		const server = createFakeServer();
		const started = [...server.state.statuses.values()].find(
			(status) =>
				status.projectId === [...server.state.projects.values()].find((project) => project.path === "CDE")!.id &&
				status.slug === "in-progress",
		)!;
		started.wipLimit = 3;
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
		const badge = within(column("In Progress")).getByText("4/3");
		expect(badge.getAttribute("data-state")).toBe("warning");
	});

	test("a drop between columns patches the cache before one move response", async () => {
		const server = createFakeServer();
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
		const server = createFakeServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		await server.client.tickets.update({ ticket: "CDE-47", title: "Changed elsewhere" });

		drop(card("CDE-47"), column("In Progress"));
		expect(within(column("In Progress")).getByText("CDE-47")).toBeDefined();
		await waitFor(() => expect(within(column("Todo")).getByText("CDE-47")).toBeDefined());
		expect(await screen.findByText("The ticket changed. The board restored its prior position.")).toBeDefined();
	});

	test("a drop inside a column sends an anchor", async () => {
		const server = createFakeServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		drop(card("CDE-47"), card("CDE-39"), "bottom");
		await waitFor(() => {
			const move = server.calls.find((call) => call.path.join(".") === "tickets.move");
			expect(move).toBeDefined();
			const input = move!.input as Record<string, unknown>;
			expect(input).toMatchObject({ ticket: "CDE-47", status: "todo" });
			expect("after" in input || "before" in input).toBe(true);
		});
	});

	test("brackets change columns and Shift with arrows reorders", async () => {
		const server = createFakeServer();
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
		const moved = card("CDE-47");
		moved.focus();
		fireEvent.keyDown(moved, { key: "ArrowDown", shiftKey: true });
		await waitFor(() => {
			const moves = server.calls.filter((call) => call.path.join(".") === "tickets.move");
			expect(moves.at(-1)?.input).toMatchObject({ ticket: "CDE-47", status: "in-progress", after: "CDE-43" });
		});
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
		const server = createFakeServer();
		const first = renderBoard(server);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Collapse Todo" }));
		expect(screen.getByRole("button", { name: "Expand Todo" })).toBeDefined();
		first.unmount();
		renderBoard(server);
		expect(await screen.findByRole("button", { name: "Expand Todo" })).toBeDefined();
	});

	test("Done shows 30 days until Show all done", async () => {
		const server = createFakeServer();
		const created = await server.client.tickets.create({ project: "CDE", title: "Old completed ticket" });
		await server.client.tickets.move({ ticket: created.identifier, status: "done" });
		findTicket(server.state, created.identifier)!.completedAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
		renderBoard(server);
		await screen.findByRole("list", { name: /^Done,/ });
		expect(screen.queryByText("Old completed ticket")).toBeNull();
		await userEvent.setup().click(screen.getByRole("button", { name: "Show all done" }));
		expect(await screen.findByText("Old completed ticket")).toBeDefined();
	});

	test("quick add creates a ticket in the column status", async () => {
		const server = createFakeServer();
		renderBoard(server);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Add ticket to Todo" }));
		const input = screen.getByRole("textbox", { name: "New ticket title in Todo" });
		await userEvent.setup().type(input, "A board ticket{Enter}");
		await waitFor(() => {
			const create = server.calls.find(
				(call) =>
					call.path.join(".") === "tickets.create" && (call.input as { title?: string }).title === "A board ticket",
			);
			expect(create?.input).toMatchObject({ project: "CDE", status: "todo" });
		});
	});

	test("a ticket.updated event moves a card without a board refetch", async () => {
		const server = createFakeServer();
		const view = renderBoard(server);
		await screen.findByText("CDE-47");
		const row = findTicket(server.state, "CDE-47")!;
		const target = matchStatus(
			[...server.state.statuses.values()].filter((status) => status.projectId === row.rootId),
			"in-progress",
		)!;
		row.statusId = target.id;
		row.version += 1;
		const calls = server.calls.filter((call) => call.path.join(".") === "tickets.board").length;

		await act(async () => {
			applyEvent(
				{ type: "ticket.updated", summary: ticketSummary(server.state, row), fields: ["status"], batchId: row.id },
				view.queryClient,
			);
			await Promise.resolve();
		});

		await waitFor(() => expect(within(column("In Progress")).getByText("CDE-47")).toBeDefined());
		expect(server.calls.filter((call) => call.path.join(".") === "tickets.board")).toHaveLength(calls);
	});
});
