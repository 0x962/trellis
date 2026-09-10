import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { layoutOf, showKeyboard } from "../../../test/keyboard";
import { Sheet } from "./Sheet";

const metrics = { frame: { x: 0, y: 0, width: 400, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

describe("Sheet", () => {
	// The sheet fills the window and its panel sits at the bottom edge. A
	// keyboard that covers the bottom 300 px pushes the panel up by 300 px,
	// so a field and the buttons in the panel stay above the keyboard.
	test("the panel moves up above the keyboard", async () => {
		await render(
			<SafeAreaProvider initialMetrics={metrics}>
				<Sheet title="Send back" testID="send-back-sheet" onClose={() => {}}>
					<TextInput accessibilityLabel="Comment" />
				</Sheet>
			</SafeAreaProvider>,
		);
		const avoider = screen.getByTestId("send-back-sheet-keyboard");
		await layoutOf(avoider, { x: 0, y: 0, width: 400, height: 900 });
		await showKeyboard(600, 300);
		expect(avoider).toHaveStyle({ paddingBottom: 300 });
	});
});
