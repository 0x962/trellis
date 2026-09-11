import { describe, expect, test } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import * as Font from "expo-font";
import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { queryClient } from "../src/lib/queryClient";
import { persistClient } from "../src/lib/storage";
import { store } from "../src/lib/store";
import { tokens } from "../src/theme/tokens";
import { appContext } from "../test/appContext";
import { instances } from "../test/mocks/react-native-sse";

const tabs = ["Needs you", "Search", "Projects", "Settings"];

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

describe("the app shell", () => {
	test("renders the four tabs with Needs you active when a server is stored", async () => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
		await renderRouter(appContext(), { initialUrl: "/" });
		for (const label of tabs) {
			expect(screen.getByRole(tabRole, { name: label })).toBeOnTheScreen();
		}
		expect(screen.getByRole(tabRole, { name: "Needs you" })).toBeSelected();
		for (const label of tabs.slice(1)) {
			expect(screen.getByRole(tabRole, { name: label })).not.toBeSelected();
		}
	});

	// Identifiers, branch names, and versions paint in JetBrains Mono. React
	// Native draws a family it holds no file for in the system font, and a
	// test that reads the style string cannot see that.
	test("the app loads the mono family before it paints a screen", async () => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
		await renderRouter(appContext(), { initialUrl: "/" });
		expect(Font.isLoaded(tokens.font.mono)).toBe(true);
		expect(screen.getByRole(tabRole, { name: "Needs you" })).toBeOnTheScreen();
	});

	// The stream reads the server URL when it opens. A person who points the
	// app at another server must not keep reading the first one.
	test("a new server closes the stream of the old one and opens one on it", async () => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
		await renderRouter(appContext(), { initialUrl: "/" });
		expect(instances).toHaveLength(1);
		expect(instances[0]!.url).toBe("http://h:4521/api/events?ping=25");

		await act(async () => {
			store.set("trellis-server-url", "http://10.0.0.9:4521");
		});
		expect(instances[0]!.closeCalls).toBe(1);
		expect(instances).toHaveLength(2);
		expect(instances[1]!.url).toBe("http://10.0.0.9:4521/api/events?ping=25");
	});

	// The snapshot is as old as the last run of the app, and a query in it
	// keeps its data until an event says otherwise. The restore marks the
	// whole cache stale, so the app fetches what changed while it was closed.
	test("the cache restored at start is marked stale", async () => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
		queryClient.clear();
		const snapshot = new QueryClient();
		snapshot.setQueryData(["tickets", "list", {}], { items: [{ identifier: "CDE-42" }] });
		await persistClient(snapshot, store);

		await renderRouter(appContext(), { initialUrl: "/" });
		// The screens mount queries of their own after the restore, so the test
		// finds the restored query by its key and not by the cache size.
		await waitFor(() => expect(queryClient.getQueryState(["tickets", "list", {}])?.isInvalidated).toBe(true));
		expect(queryClient.getQueryData(["tickets", "list", {}])).toEqual({ items: [{ identifier: "CDE-42" }] });
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
