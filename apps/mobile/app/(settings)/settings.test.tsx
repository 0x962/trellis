import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import * as Clipboard from "expo-clipboard";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { store } from "../../src/lib/store";
import { appContext } from "../../test/appContext";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

// The app version comes from expo-constants. The mock pins it, so the test
// does not depend on app.json.
jest.mock("expo-constants", () => {
	const actual = jest.requireActual<typeof import("expo-constants")>("expo-constants");
	return { __esModule: true, ...actual, default: { ...actual.default, expoConfig: { version: "0.1.0" } } };
});

const setStringAsync = jest.mocked(Clipboard.setStringAsync);

const theme = (label: string) => screen.getByRole("radio", { name: label });

describe("the Settings tab", () => {
	beforeEach(() => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
		setStringAsync.mockClear();
	});

	test("shows name, server, theme with dark selected, version, and the notifications note", async () => {
		await renderRouter(appContext(), { initialUrl: "/settings" });
		expect(screen.getByText("dana")).toBeOnTheScreen();
		expect(screen.getByText("http://h:4521")).toBeOnTheScreen();
		for (const label of ["System", "Light", "Dark"]) {
			expect(theme(label)).toBeOnTheScreen();
		}
		expect(theme("Dark")).toBeChecked();
		expect(theme("System")).not.toBeChecked();
		expect(theme("Light")).not.toBeChecked();
		expect(screen.getByText(/0\.1\.0/)).toBeOnTheScreen();
		expect(screen.getByText("Notifications: not yet")).toBeOnTheScreen();
	});

	// The command is the CLI's own `trellis install`, which sets a machine up
	// to serve trellis.
	test("copies the trellis install command to the clipboard", async () => {
		await renderRouter(appContext(), { initialUrl: "/settings" });
		await fireEvent.press(screen.getByText("Copy trellis install command"));
		await waitFor(() => expect(setStringAsync).toHaveBeenCalledTimes(1));
		expect(setStringAsync.mock.calls[0]?.[0]).toMatch(/^trellis install\b/);
	});

	test("the Server row opens setup and the theme control persists a choice", async () => {
		const view = renderRouter(appContext(), { initialUrl: "/settings" });
		await view;
		await fireEvent.press(theme("Light"));
		expect(store.getString("trellis-theme")).toBe("light");
		expect(theme("Light")).toBeChecked();
		expect(theme("Dark")).not.toBeChecked();

		await fireEvent.press(screen.getByText("Server"));
		await waitFor(() => expect(view.getPathname()).toBe("/setup"));
		expect(screen.getByDisplayValue("http://h:4521")).toBeOnTheScreen();
	});
});
