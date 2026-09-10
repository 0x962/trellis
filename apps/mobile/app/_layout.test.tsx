import { describe, expect, test } from "@jest/globals";
import { renderRouter, screen } from "expo-router/testing-library";
import { createMMKV } from "react-native-mmkv";
import { appContext } from "../test/appContext";

const store = createMMKV();
const tabs = ["Needs you", "Search", "Projects", "Settings"];

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

describe("the app shell", () => {
	test("renders the four tabs with Needs you active when a server is stored", async () => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
		await renderRouter(appContext(), { initialUrl: "/" });
		for (const label of tabs) {
			expect(screen.getByRole(tabRole, { name: label })).toBeOnTheScreen();
		}
		expect(screen.getByRole(tabRole, { name: "Needs you" })).toBeSelected();
		for (const label of tabs.slice(1)) {
			expect(screen.getByRole(tabRole, { name: label })).not.toBeSelected();
		}
	});

	test("shows the setup screen when no URL is stored", async () => {
		await renderRouter(appContext(), { initialUrl: "/" });
		expect(screen.getByDisplayValue("http://")).toBeOnTheScreen();
		expect(screen.getByText("Test connection")).toBeOnTheScreen();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		for (const label of tabs) {
			expect(screen.queryByText(label)).toBeNull();
		}
	});

	test("shows the setup screen when a URL is stored without a name", async () => {
		store.set("trellis-server-url", "http://192.168.1.20:4521");
		await renderRouter(appContext(), { initialUrl: "/" });
		expect(screen.getByDisplayValue("http://192.168.1.20:4521")).toBeOnTheScreen();
		expect(screen.getByText("Test connection")).toBeOnTheScreen();
		for (const label of tabs) {
			expect(screen.queryByText(label)).toBeNull();
		}
	});
});
