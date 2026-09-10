import { beforeEach, describe, expect, test } from "@jest/globals";
import { renderRouter, screen } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { installFakeApp } from "../../../test/fakeApp";
import { layoutOf, showKeyboard } from "../../../test/keyboard";
import { layout } from "../../theme/layout";

describe("the ticket screen and the keyboard", () => {
	beforeEach(() => {
		installFakeApp();
	});

	// The screen sits under the stack header, which is the top inset (0 in
	// tests) plus `layout.header`. The native layout pass gives the screen a
	// frame at y 0 inside its parent, so its bottom edge is `layout.header +
	// height` px below the top of the window. A keyboard whose top edge is at
	// 500 px covers the part of the screen below 500 px, and the screen pads
	// its bottom by that part, so the composer sits on the keyboard.
	test("the composer sits above the keyboard", async () => {
		await renderRouter(appContext(), { initialUrl: "/ticket/CDE-42" });
		await screen.findByText("Restore the fork pages after the upstream 1.27 merge");
		const ticketScreen = screen.getByTestId("ticket-screen");
		const height = 700;
		await layoutOf(ticketScreen, { x: 0, y: 0, width: 400, height });
		await showKeyboard(500, 400);
		expect(ticketScreen).toHaveStyle({ paddingBottom: layout.header + height - 500 });
	});
});
