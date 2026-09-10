import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { useComposerStore } from "../../composer/composerStore";
import { Board } from ".";

beforeEach(() => {
	localStorage.clear();
	useComposerStore.setState({ open: false, options: {} });
});

const renderBoard = (server = createFakeServer()) =>
	renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
		path: "/p/CDE/board",
		actor: "navid",
		server,
	});

const column = (name: string) => screen.getByRole("list", { name: new RegExp(`^${name},`) });

const card = (identifier: string) => screen.getByRole("listitem", { name: new RegExp(`^${identifier} `) });

const identifiers = (list: HTMLElement) =>
	within(list)
		.queryAllByRole("listitem")
		.map((item) => item.getAttribute("aria-label")!.split(" ")[0]!);

// Starts a drag on `source` and holds it over `target`, with no drop.
const hover = (source: HTMLElement, target: HTMLElement) => {
	const dataTransfer = new DataTransfer();
	dataTransfer.setDragImage = () => {};
	document.elementFromPoint = () => target;
	document.elementsFromPoint = () => [target];
	fireEvent.dragStart(source, { dataTransfer, clientX: 1, clientY: 10_000 });
	fireEvent.dragEnter(target, { dataTransfer, clientX: 1, clientY: 10_000 });
	fireEvent.dragOver(target, { dataTransfer, clientX: 1, clientY: 10_000 });
	return dataTransfer;
};

describe("Board drag", () => {
	test("the drag preview draws the whole card: ID, title, and the card surface", async () => {
		renderBoard();
		const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
		let image: Element | null = null;
		const dataTransfer = new DataTransfer();
		// The browser takes its picture when setDragImage runs, and the drag
		// library removes the preview one frame later. The copy keeps what
		// the browser saw.
		dataTransfer.setDragImage = (element) => {
			image = element.cloneNode(true) as Element;
		};
		document.elementsFromPoint = () => [item];
		fireEvent.dragStart(item, { dataTransfer, clientX: 1, clientY: 1 });
		await waitFor(() => expect(image).not.toBeNull());
		const preview = (image as unknown as HTMLElement).querySelector<HTMLElement>("[data-card-preview]")!;
		expect(preview.textContent).toContain("CDE-47");
		expect(preview.textContent).toContain(item.getAttribute("aria-label")!.slice("CDE-47 ".length));
		expect(preview.className).toMatch(/\bbg-elevated\b/);
		expect(preview.className).toMatch(/\bborder-border-strong\b/);
		expect(preview.className).toMatch(/\bp-3\b/);
		expect(preview.style.width).toMatch(/px$/);
		fireEvent.dragEnd(item, { dataTransfer });
	});

	test("the source card keeps its slot and fades while it drags", async () => {
		renderBoard();
		const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
		const dataTransfer = hover(item, item);
		await waitFor(() => expect(card("CDE-47").getAttribute("data-dragging")).toBe("true"));
		expect(card("CDE-47").className).toMatch(/\bopacity-40\b/);
		expect(identifiers(column("Todo"))).toContain("CDE-47");
		fireEvent.dragEnd(item, { dataTransfer });
		await waitFor(() => expect(card("CDE-47").getAttribute("data-dragging")).toBeNull());
	});

	test("over the empty part of a column, one line shows under the last card and the column has no tint", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const target = column("In Progress");
		const last = identifiers(target).at(-1)!;
		const dataTransfer = hover(card("CDE-47"), target);
		await waitFor(() => expect(document.querySelectorAll("[data-drag-indicator]")).toHaveLength(1));
		const line = document.querySelector<HTMLElement>("[data-drag-indicator]")!;
		expect(line.closest("li")?.getAttribute("aria-label")?.split(" ")[0]).toBe(last);
		expect(line.getAttribute("data-edge")).toBe("bottom");
		expect(target.closest("section")!.className).not.toMatch(/bg-accent/);
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("over a card, only the card's line shows", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const first = identifiers(column("In Progress"))[0]!;
		const dataTransfer = hover(card("CDE-47"), card(first));
		await waitFor(() => expect(document.querySelectorAll("[data-drag-indicator]")).toHaveLength(1));
		expect(card(first).querySelector("[data-drag-indicator]")).not.toBeNull();
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("entering a card draws its line at once, before the next dragover", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const first = card(identifiers(column("In Progress"))[0]!);
		const dataTransfer = new DataTransfer();
		dataTransfer.setDragImage = () => {};
		document.elementFromPoint = () => first;
		document.elementsFromPoint = () => [first];
		fireEvent.dragStart(card("CDE-47"), { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnter(first, { dataTransfer, clientX: 1, clientY: 10_000 });
		await waitFor(() => expect(first.querySelector("[data-drag-indicator]")).not.toBeNull());
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("a drop on the empty part of a column puts the ticket after the last card", async () => {
		const server = createFakeServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		const target = column("In Progress");
		const last = identifiers(target).at(-1)!;
		const dataTransfer = hover(card("CDE-47"), target);
		fireEvent.drop(target, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
		await waitFor(() => {
			const move = server.calls.find((call) => call.path.join(".") === "tickets.move");
			expect(move?.input).toMatchObject({ ticket: "CDE-47", status: "in-progress", after: last });
		});
		expect(identifiers(column("In Progress")).at(-1)).toBe("CDE-47");
	});

	test("the column header sits outside the list that scrolls", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const list = column("Todo");
		expect(list.querySelector("header")).toBeNull();
		expect(list.className).toMatch(/\boverflow-y-auto\b/);
		expect(list.closest("section")!.querySelector("header h2")!.textContent).toBe("Todo");
	});

	test("an arrow key focuses the next card without a page scroll, then scrolls its list just enough", async () => {
		const scroll = spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
		try {
			renderBoard();
			const item = await screen.findByRole("listitem", { name: /^CDE-47 / });
			const next = identifiers(column("Todo"))[identifiers(column("Todo")).indexOf("CDE-47") + 1]!;
			item.focus();
			fireEvent.keyDown(item, { key: "ArrowDown" });
			expect(document.activeElement).toBe(card(next));
			expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
		} finally {
			scroll.mockRestore();
		}
	});

	test("Shift+Enter in quick add opens New ticket with the project and the column status", async () => {
		renderBoard();
		await userEvent.setup().click(await screen.findByRole("button", { name: "New ticket in Todo" }));
		const input = screen.getByRole("textbox", { name: "New ticket title in Todo" });
		await userEvent.setup().type(input, "Draft{Shift>}{Enter}{/Shift}");
		expect(useComposerStore.getState()).toMatchObject({ open: true, options: { project: "CDE", status: "todo" } });
	});
});
