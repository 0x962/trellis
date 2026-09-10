import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { paintedColors } from "../../../test/paint";
import { tokens } from "../../theme/tokens";
import { PriorityIcon } from "./PriorityIcon";

const backgroundOf = (element: { props: { style?: unknown } }) =>
	(StyleSheet.flatten(element.props.style as never) as { backgroundColor?: string }).backgroundColor;

describe("PriorityIcon", () => {
	// A fresh install is dark, so the bars paint the dark palette.
	test("fills the bars by priority and draws urgent as a danger square", async () => {
		const palette = tokens.dark;
		const cases = [
			["none", 0],
			["low", 1],
			["medium", 2],
			["high", 3],
		] as const;
		for (const [priority, filled] of cases) {
			const { unmount } = await render(<PriorityIcon priority={priority} />);
			expect(screen.getByLabelText(`Priority: ${priority}`)).toBeOnTheScreen();
			const bars = screen.getAllByTestId("priority-bar");
			expect(bars).toHaveLength(3);
			expect(bars.filter((bar) => backgroundOf(bar) === palette.fgMuted)).toHaveLength(filled);
			await unmount();
		}

		await render(<PriorityIcon priority="urgent" />);
		expect(screen.getByLabelText("Priority: urgent")).toBeOnTheScreen();
		expect(screen.getByText("!")).toBeOnTheScreen();
		expect(screen.queryAllByTestId("priority-bar")).toHaveLength(0);
		expect(paintedColors(screen.toJSON())).toContain(palette.danger);
	});
});
