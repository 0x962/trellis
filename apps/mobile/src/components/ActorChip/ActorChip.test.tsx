import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { tokens } from "../../theme/tokens";
import { ActorChip } from "./ActorChip";

const textStyle = (element: { props: { style?: unknown } }) =>
	StyleSheet.flatten(element.props.style as never) as {
		fontFamily?: string;
		fontWeight?: string | number;
		color?: string;
	};

describe("ActorChip", () => {
	// A fresh install is dark, so the names paint the dark palette.
	test("an agent and a human never read alike", async () => {
		const palette = tokens.dark;
		const agent = await render(<ActorChip name="claude-code" kind="agent" live />);
		const agentName = textStyle(screen.getByText("claude-code"));
		expect(agentName.fontFamily).not.toBe(tokens.font.mono);
		expect(agentName.color).toBe(palette.agent);
		expect(screen.getByText("· agent")).toBeOnTheScreen();
		expect(screen.getByTestId("live-dot")).toBeOnTheScreen();
		await agent.unmount();

		await render(<ActorChip name="dana" kind="human" />);
		const humanName = textStyle(screen.getByText("dana"));
		expect(String(humanName.fontWeight)).toBe("500");
		expect(humanName.color).toBe(palette.fg);
		expect(humanName.fontFamily).not.toBe(tokens.font.mono);
		expect(screen.queryByText("· agent")).toBeNull();
		expect(screen.queryByTestId("live-dot")).toBeNull();
	});
});
