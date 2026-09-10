import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { TicketSummary } from "@trellis/api";
import { StyleSheet } from "react-native";
import { paintedColors } from "../../../test/paint";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { TicketRow } from "./TicketRow";

const id = (suffix: string) => `01J8Z6X4Q3M2K1H0G9F8E7${suffix}`;

const summary = (overrides: Partial<TicketSummary> = {}): TicketSummary => ({
	id: id("D6T1"),
	identifier: "CDE-42",
	number: 42,
	title: "Restore the fork pages after the upstream 1.27 merge",
	priority: "high",
	status: {
		id: id("D6S1"),
		slug: "human-review",
		name: "Human Review",
		category: "review",
		reviewer: "human",
		color: "accent",
	},
	project: { id: id("D6P1"), key: "CDE", path: "CDE.web" },
	parent: null,
	childCount: 0,
	childDoneCount: 0,
	commentCount: 4,
	attachmentCount: 1,
	pr: { state: "open", ciState: "fail", pass: 3, fail: 1, pending: 0 },
	lastActor: { name: "claude-code", kind: "agent", at: "2026-09-09T23:19:05.040Z" },
	position: 1024,
	version: 10,
	createdAt: "2026-09-08T10:00:00.000Z",
	updatedAt: "2026-09-09T23:19:05.040Z",
	completedAt: null,
	...overrides,
});

// The height the row paints, read from the pressable that holds it.
const rowHeight = (testId: string) => {
	const style = StyleSheet.flatten(screen.getByTestId(testId).props.style) as { height?: number };
	return style.height;
};

describe("TicketRow", () => {
	test("a row shows the priority, the id, the title, the status, the ribbon, and the last actor", async () => {
		const ticket = summary();
		await render(<TicketRow ticket={ticket} onPress={() => {}} />);

		expect(screen.getByLabelText("Priority: high")).toBeOnTheScreen();
		const identifier = screen.getByText("CDE-42");
		expect(StyleSheet.flatten(identifier.props.style)).toMatchObject({ fontFamily: tokens.font.mono });
		const title = screen.getByText(ticket.title);
		expect(title.props.numberOfLines).toBe(1);
		expect(screen.getByLabelText(/Human Review/)).toBeOnTheScreen();
		// Three passing checks and one failing check give four segments.
		expect(screen.getAllByTestId("ribbon-segment")).toHaveLength(4);
		expect(screen.getByText("claude-code")).toBeOnTheScreen();
	});

	test("a row without a pull request keeps the same fixed height", async () => {
		const full = await render(<TicketRow ticket={summary()} onPress={() => {}} />);
		expect(rowHeight("ticket-row")).toBe(layout.ticketRow);
		await full.unmount();

		await render(<TicketRow ticket={summary({ pr: null, lastActor: null })} onPress={() => {}} />);
		expect(screen.queryByTestId("check-ribbon")).toBeNull();
		expect(screen.queryByText("claude-code")).toBeNull();
		expect(rowHeight("ticket-row")).toBe(layout.ticketRow);
	});

	test("a press hands the ticket identifier to onPress", async () => {
		const onPress = jest.fn();
		await render(<TicketRow ticket={summary()} onPress={onPress} />);
		fireEvent.press(screen.getByTestId("ticket-row"));
		expect(onPress).toHaveBeenCalledWith("CDE-42");
	});

	test("a row paints only token colors", async () => {
		// A fresh install is dark, so every color comes from the dark palette.
		const allowed = new Set<string>([...Object.values(tokens.dark), tokens.onAccent]);
		await render(<TicketRow ticket={summary()} onPress={() => {}} />);
		const painted = [...paintedColors(screen.toJSON())];
		expect(painted.length).toBeGreaterThan(0);
		expect(painted.filter((color) => !allowed.has(color))).toEqual([]);
	});
});
