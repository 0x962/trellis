import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { renderRouter, screen } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { installFakeApp } from "../../../test/fakeApp";
import { tokens } from "../../theme/tokens";

// A notched iPhone: a 34 px home indicator under the content.
jest.mock("react-native-safe-area-context", () => {
	const actual = jest.requireActual<typeof import("react-native-safe-area-context")>("react-native-safe-area-context");
	return { ...actual, useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) };
});

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

describe("the composer above the tab bar", () => {
	beforeEach(() => {
		installFakeApp();
	});

	// The tab bar stays under a pushed ticket and holds the home indicator
	// inset itself, so the composer adds only its own spacing.
	test("the composer adds no bottom inset over the tab bar", async () => {
		await renderRouter(appContext(), { initialUrl: "/ticket/CDE-42" });
		await screen.findByText("Restore the fork pages after the upstream 1.27 merge");
		expect(screen.getByRole(tabRole, { name: "Needs you" })).toBeOnTheScreen();
		expect(screen.getByTestId("composer")).toHaveStyle({ paddingBottom: tokens.space[2] });
	});
});
