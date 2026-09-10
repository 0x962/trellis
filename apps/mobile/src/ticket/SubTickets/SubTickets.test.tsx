import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { id, ticketSummary } from "../../../test/fixtures";
import { SubTickets } from "./SubTickets";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const push = jest.mocked(router.push);

const done = { id: id("S5"), slug: "done", name: "Done", category: "done", reviewer: null, color: "success" } as const;
const todo = { id: id("S1"), slug: "todo", name: "Todo", category: "todo", reviewer: null, color: "fg-faint" } as const;

// The three children of CDE-42.
const children = [
	ticketSummary({
		id: id("T8"),
		identifier: "CDE-48",
		number: 48,
		title: "Actions page: keep the starred runs after a reload",
		status: done,
	}),
	ticketSummary({
		id: id("T9"),
		identifier: "CDE-49",
		number: 49,
		title: "Focus the terminal of a new tab",
		status: done,
	}),
	ticketSummary({
		id: id("TA"),
		identifier: "CDE-50",
		number: 50,
		title: "Terminals page: rename a tab on double click",
		status: todo,
	}),
];

describe("SubTickets", () => {
	// O33.
	test("lists the sub-tickets with the progress bar and the done count", async () => {
		await render(<SubTickets tickets={children} />);
		for (const child of children) {
			expect(screen.getByText(child.identifier)).toBeOnTheScreen();
			expect(screen.getByText(child.title)).toBeOnTheScreen();
		}
		expect(screen.getAllByRole("image", { name: "Status: Done" })).toHaveLength(2);
		expect(screen.getByRole("image", { name: "Status: Todo" })).toBeOnTheScreen();
		expect(screen.getByText("2 of 3")).toBeOnTheScreen();
		expect(screen.getByTestId("sub-ticket-progress")).toBeOnTheScreen();
	});

	// O34.
	test("a sub-ticket row opens that ticket", async () => {
		push.mockClear();
		await render(<SubTickets tickets={children} />);
		await fireEvent.press(screen.getByText("CDE-48"));
		expect(push).toHaveBeenCalledTimes(1);
		expect(push).toHaveBeenCalledWith("/ticket/CDE-48");
	});
});
