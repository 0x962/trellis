import { beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { commandActions, useCommandStore } from "../../command/commandStore";
import { Board } from ".";

beforeEach(() => {
	localStorage.clear();
	commandActions.reset();
});

const renderBoard = () =>
	renderWithProviders(<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />, {
		path: "/p/CDE/board",
		actor: "navid",
	});

// The cards of one column, top to bottom.
const cardsIn = (name: string) =>
	within(screen.getByRole("list", { name: new RegExp(`^${name},`) })).getAllByRole("listitem");

// A card's accessible name starts with its identifier.
const identifierOf = (card: HTMLElement) => card.getAttribute("aria-label")!.split(" ")[0]!;

const focusedTicket = () => useCommandStore.getState().focusedTicket;

describe("features/board/Board: command context", () => {
	// The palette's This ticket section acts on the card that holds the
	// focus, the same way it acts on a focused table row.
	test("the focused card is the ticket the palette acts on", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const [first, second] = cardsIn("Todo");
		act(() => first!.focus());
		await waitFor(() => expect(focusedTicket()).toBe(identifierOf(first!)));
		fireEvent.keyDown(first!, { key: "ArrowDown" });
		await waitFor(() => expect(focusedTicket()).toBe(identifierOf(second!)));
	});

	test("an unmounted board clears the ticket it wrote", async () => {
		renderBoard();
		await screen.findByText("CDE-47");
		const [first] = cardsIn("Todo");
		act(() => first!.focus());
		await waitFor(() => expect(focusedTicket()).toBe(identifierOf(first!)));
		cleanup();
		expect(focusedTicket()).toBeNull();
	});

	// A board with no focused card must not erase the context another
	// surface wrote.
	test("a board that never had a focused card keeps the context another surface wrote", async () => {
		commandActions.setFocusedTicket("CDE-42");
		renderBoard();
		await screen.findByText("CDE-47");
		expect(focusedTicket()).toBe("CDE-42");
	});
});
