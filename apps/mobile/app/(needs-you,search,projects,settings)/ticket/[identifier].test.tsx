import { beforeEach, describe, expect, test } from "@jest/globals";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { store } from "../../../src/lib/store";
import { appContext } from "../../../test/appContext";

const tabs = ["Needs you", "Search", "Projects", "Settings"];

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

describe("the ticket route", () => {
	beforeEach(() => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
	});

	// Each tab holds its own stack. A second ticket goes on top of the first
	// one, and back returns to the ticket under it.
	test("a second ticket pushes on top of the first and back returns to it", async () => {
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		await act(async () => {
			router.push("/ticket/CDE-42");
		});
		await act(async () => {
			router.push("/ticket/CDE-43");
		});
		expect(view.getPathname()).toBe("/ticket/CDE-43");
		await act(async () => {
			router.back();
		});
		expect(view.getPathname()).toBe("/ticket/CDE-42");
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
		await act(async () => {
			router.back();
		});
		expect(view.getPathname()).toBe("/");
	});

	// The stack belongs to the tab. Another tab and back again finds the
	// ticket where the person left it.
	test("a ticket stays in the tab it was opened from", async () => {
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		await act(async () => {
			router.push("/ticket/CDE-42");
		});
		await fireEvent.press(screen.getByRole(tabRole, { name: "Projects" }));
		expect(view.getPathname()).toBe("/projects");
		await fireEvent.press(screen.getByRole(tabRole, { name: "Needs you" }));
		expect(view.getPathname()).toBe("/ticket/CDE-42");
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
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
