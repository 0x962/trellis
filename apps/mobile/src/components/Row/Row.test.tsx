import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { paintedColors } from "../../../test/paint";
import { tokens } from "../../theme/tokens";
import { Chip } from "../Chip";
import { StatusIcon } from "../StatusIcon";
import { Row } from "./Row";

const title =
	"Restore the fork pages after the upstream 1.27 merge, then rebuild the desktop app and reinstall it over the daily build";

const textStyle = (element: { props: { style?: unknown } }) =>
	StyleSheet.flatten(element.props.style as never) as { fontFamily?: string };

describe("Row and Chip", () => {
	test("a row keeps the 44 px hit area and truncates the title to one line", async () => {
		const { unmount } = await render(
			<Row id="CDE-42" title={title} leading={<StatusIcon category="review" />} trailing="2h" onPress={() => {}} />,
		);
		expect(screen.getByRole("button")).toHaveStyle({ minHeight: 44 });
		expect(screen.getByText(title).props.numberOfLines).toBe(1);
		expect(textStyle(screen.getByText("CDE-42")).fontFamily).toBe(tokens.font.mono);
		expect(screen.getByText("2h")).toBeOnTheScreen();
		await unmount();

		await render(<Chip mono>cde-42-restore-fork-pages</Chip>);
		expect(textStyle(screen.getByText("cde-42-restore-fork-pages")).fontFamily).toBe(tokens.font.mono);
		const colors = paintedColors(screen.toJSON());
		expect(colors.size).toBeGreaterThan(0);
		const palette = new Set(Object.values(tokens.dark));
		expect([...colors].filter((color) => !palette.has(color))).toEqual([]);
	});
});
