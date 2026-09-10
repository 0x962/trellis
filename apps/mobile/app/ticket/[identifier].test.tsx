import { beforeEach, describe, expect, test } from "@jest/globals";
import { router } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { createMMKV } from "react-native-mmkv";
import { appContext } from "../../test/appContext";

const store = createMMKV();
const tabs = ["Needs you", "Search", "Projects", "Settings"];

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

describe("the ticket route", () => {
	beforeEach(() => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
	});

	// The ticket is a push over the tab the person came from: the header
	// carries the identifier and a back control, and the tab bar stays.
	test("the ticket route pushes a stack screen titled by the identifier", async () => {
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		await act(async () => {
			router.push("/ticket/CDE-42");
		});
		expect(view.getPathname()).toBe("/ticket/CDE-42");
		expect(router.canGoBack()).toBe(true);
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
		expect(screen.getByLabelText(/back/i)).toBeOnTheScreen();
		for (const label of tabs) {
			expect(screen.getByRole(tabRole, { name: label })).toBeOnTheScreen();
		}
	});
});
