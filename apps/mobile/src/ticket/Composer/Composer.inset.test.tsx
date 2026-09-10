import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { screen } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { seeder } from "../../../test/server";
import { seedTicketScreen, type TicketData, title } from "../../../test/ticket";
import { tokens } from "../../theme/tokens";

// A notched iPhone: a 34 px home indicator under the content.
jest.mock("react-native-safe-area-context", () => {
	const actual = jest.requireActual<typeof import("react-native-safe-area-context")>("react-native-safe-area-context");
	return { ...actual, useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) };
});

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

let data: TicketData;
let net: Recorder;

describe("the composer above the tab bar", () => {
	beforeEach(async () => {
		data = await seedTicketScreen(seeder);
		net = connect();
	});

	afterEach(() => net.restore());

	// The tab bar stays under a pushed ticket and holds the home indicator
	// inset itself, so the composer adds only its own spacing.
	test("the composer adds no bottom inset over the tab bar", async () => {
		await renderRoute(`/ticket/${data.ticket}`);
		await screen.findByText(title);
		expect(screen.getByRole(tabRole, { name: "Needs you" })).toBeOnTheScreen();
		expect(screen.getByTestId("composer")).toHaveStyle({ paddingBottom: tokens.space[2] });
	});
});
