import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { useComposerStore } from "../../composer/composerStore";
import { Board } from ".";

beforeEach(() => {
	localStorage.clear();
	useComposerStore.setState({ open: false, options: {} });
});

const renderBoard = (server = createTestServer()) =>
	renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
		path: "/p/CDE/board",
		actor: "dana",
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

	test("over the empty part of another column, one line shows above its first card and the column has no tint", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const target = column("In Progress");
		const first = identifiers(target)[0]!;
		const dataTransfer = hover(card("CDE-47"), target);
		await waitFor(() => expect(document.querySelectorAll("[data-drag-indicator]")).toHaveLength(1));
		const line = document.querySelector<HTMLElement>("[data-drag-indicator]")!;
		expect(line.closest("li")?.getAttribute("aria-label")?.split(" ")[0]).toBe(first);
		expect(line.getAttribute("data-edge")).toBe("top");
		expect(target.closest("section")!.className).not.toMatch(/bg-accent/);
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	// The card lands at the top of the column it enters, whatever card the
	// pointer rests on, so one line shows and it shows there.
	test("over the last card of another column, only the line above its first card shows", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const shown = identifiers(column("In Progress"));
		const dataTransfer = hover(card("CDE-47"), card(shown.at(-1)!));
		await waitFor(() => expect(document.querySelectorAll("[data-drag-indicator]")).toHaveLength(1));
		expect(card(shown[0]!).querySelector("[data-drag-indicator]")).not.toBeNull();
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("a card of the dragged card's own column takes no line", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const shown = identifiers(column("Todo"));
		const other = shown.find((identifier) => identifier !== "CDE-47")!;
		const dataTransfer = hover(card("CDE-47"), card(other));
		await waitFor(() => expect(card("CDE-47").getAttribute("data-dragging")).toBe("true"));
		expect(document.querySelectorAll("[data-drag-indicator]")).toHaveLength(0);
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("entering a card of another column draws the line at once, before the next dragover", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const shown = identifiers(column("In Progress"));
		const last = card(shown.at(-1)!);
		const dataTransfer = new DataTransfer();
		dataTransfer.setDragImage = () => {};
		document.elementFromPoint = () => last;
		document.elementsFromPoint = () => [last];
		fireEvent.dragStart(card("CDE-47"), { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnter(last, { dataTransfer, clientX: 1, clientY: 10_000 });
		await waitFor(() => expect(card(shown[0]!).querySelector("[data-drag-indicator]")).not.toBeNull());
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
	});

	test("a drop on another column moves the ticket there with no anchor and puts it at the top", async () => {
		const server = createTestServer();
		renderBoard(server);
		await screen.findByText("CDE-47");
		const target = column("In Progress");
		const dataTransfer = hover(card("CDE-47"), target);
		fireEvent.drop(target, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnd(card("CDE-47"), { dataTransfer });
		await waitFor(() => {
			const move = server.calls.find((call) => call.path.join(".") === "tickets.move");
			expect(move).toBeDefined();
			const input = move!.input as Record<string, unknown>;
			expect(input).toMatchObject({ ticket: "CDE-47", status: "in-progress" });
			expect("after" in input || "before" in input).toBe(false);
		});
		expect(identifiers(column("In Progress"))[0]).toBe("CDE-47");
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

	test("the ghost row under the last card opens New ticket with the project and the column status", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const ghost = within(column("Todo")).getByRole("button", { name: "New ticket" });
		await userEvent.setup().click(ghost);
		expect(useComposerStore.getState()).toMatchObject({ open: true, options: { project: "CDE", status: "todo" } });
	});
});
