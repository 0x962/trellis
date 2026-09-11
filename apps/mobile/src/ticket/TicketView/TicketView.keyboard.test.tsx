import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { screen } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import { layoutOf, showKeyboard } from "../../../test/keyboard";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { seeder } from "../../../test/server";
import { seedTicketScreen, type TicketData, title } from "../../../test/ticket";
import { layout } from "../../theme/layout";

let data: TicketData;
let net: Recorder;

describe("the ticket screen and the keyboard", () => {
	beforeEach(async () => {
		data = await seedTicketScreen(seeder);
		net = connect();
	});

	afterEach(() => net.restore());

	// The screen sits under the stack header, which is the top inset (0 in
	// tests) plus `layout.header`. The native layout pass gives the screen a
	// frame at y 0 inside its parent, so its bottom edge is `layout.header +
	// height` px below the top of the window. A keyboard whose top edge is at
	// 500 px covers the part of the screen below 500 px, and the screen pads
	// its bottom by that part, so the composer sits on the keyboard.
	test("the composer sits above the keyboard", async () => {
		await renderRoute(`/ticket/${data.ticket}`);
		await screen.findByText(title);
		const ticketScreen = screen.getByTestId("ticket-screen");
		const height = 700;
		await layoutOf(ticketScreen, { x: 0, y: 0, width: 400, height });
		await showKeyboard(500, 400);
		expect(ticketScreen).toHaveStyle({ paddingBottom: layout.header + height - 500 });
	});
});
