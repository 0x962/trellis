import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import { extractExpoPathFromURL } from "expo-router/build/fork/extractPathFromURL";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { queryClient } from "../src/lib/queryClient";
import * as server from "../src/lib/server";
import { store } from "../src/lib/store";
import { appContext } from "../test/appContext";
import { scan } from "../test/mocks/expo-camera";

jest.mock("../src/lib/server", () => ({
	...jest.requireActual<typeof server>("../src/lib/server"),
	probeHealth: jest.fn(),
}));

const probeHealth = jest.mocked(server.probeHealth);
const url = "http://192.168.1.20:4521";
// What the web settings page encodes in its QR code for that server.
const pairLink = "trellis://pair?url=http%3A%2F%2F192.168.1.20%3A4521";
// renderRouter takes a path, not a link. The app turns an opened link into a
// path with expo-router's own extractExpoPathFromURL, so the test does too.
const linkedPath = `/${extractExpoPathFromURL([], pairLink)}`;

const typeUrl = (value: string) => fireEvent.changeText(screen.getByLabelText("Server URL"), value);
const typeName = (value: string) => fireEvent.changeText(screen.getByLabelText("Name"), value);
const testConnection = () => fireEvent.press(screen.getByText("Test connection"));
const save = () => screen.getByRole("button", { name: "Save" });

describe("the setup screen", () => {
	beforeEach(() => {
		probeHealth.mockReset();
		queryClient.clear();
	});

	test("Test connection shows version, ticket count, and actor name, and Save stores both", async () => {
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		const view = renderRouter(appContext(), { initialUrl: "/setup" });
		await view;
		await typeUrl(url);
		await testConnection();
		expect(await screen.findByText(/0\.1\.0/)).toBeOnTheScreen();
		expect(screen.getByText("12 tickets")).toBeOnTheScreen();
		expect(screen.getByText("navid")).toBeOnTheScreen();
		expect(probeHealth).toHaveBeenCalledTimes(1);
		expect(probeHealth.mock.calls[0]?.[0]).toBe(url);
		expect(save()).toBeDisabled();

		await typeName("navid");
		expect(save()).toBeEnabled();
		await fireEvent.press(save());
		expect(store.getString("trellis-server-url")).toBe(url);
		expect(store.getString("trellis-actor-name")).toBe("navid");
		await waitFor(() => expect(view.getPathname()).toBe("/"));
	});

	test("a failed probe shows the specific error and keeps Save disabled", async () => {
		await renderRouter(appContext(), { initialUrl: "/setup" });
		await typeUrl(url);
		await typeName("navid");
		const cases: Array<[Awaited<ReturnType<typeof server.probeHealth>>, string | RegExp]> = [
			[{ ok: false, kind: "timeout" }, "Timed out after 3 s"],
			[{ ok: false, kind: "unreachable", detail: "fetch failed: ECONNREFUSED" }, /ECONNREFUSED/],
			[{ ok: false, kind: "not-trellis" }, "Not a trellis server"],
		];
		for (const [result, message] of cases) {
			probeHealth.mockResolvedValueOnce(result);
			await testConnection();
			expect(await screen.findByText(message)).toBeOnTheScreen();
			expect(save()).toBeDisabled();
		}
		expect(probeHealth).toHaveBeenCalledTimes(cases.length);
	});

	// The client parses `human:<name>` before it builds a request and throws
	// on a name outside the grammar. A throw inside Test connection would
	// leave the button disabled and show nothing.
	test("a name outside the actor grammar never reaches the probe and never saves", async () => {
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		await renderRouter(appContext(), { initialUrl: "/setup" });
		await typeUrl(url);
		await typeName("navid:khan");
		await testConnection();
		expect(probeHealth).not.toHaveBeenCalled();
		expect(await screen.findByText(/colon/)).toBeOnTheScreen();
		expect(screen.getByText("Test connection")).toBeOnTheScreen();
		expect(save()).toBeDisabled();

		await typeName("navid");
		await testConnection();
		expect(await screen.findByText("12 tickets")).toBeOnTheScreen();
		expect(save()).toBeEnabled();

		await typeName("Zoë");
		expect(save()).toBeDisabled();
		await typeName("n".repeat(65));
		expect(save()).toBeDisabled();
		expect(store.getString("trellis-actor-name")).not.toBe("n".repeat(65));
	});

	// The person edits the URL while the first probe is still open. The
	// answer belongs to the URL it asked, so it approves no other URL.
	test("a probe that lands after the URL changes approves nothing", async () => {
		const other = "http://10.0.0.9:4521";
		let answer = (_result: Awaited<ReturnType<typeof server.probeHealth>>) => {};
		probeHealth.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		await renderRouter(appContext(), { initialUrl: "/setup" });
		await typeUrl(url);
		await typeName("navid");
		await testConnection();
		await typeUrl(other);
		await act(async () => {
			answer({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		});
		expect(screen.queryByText("12 tickets")).toBeNull();
		expect(save()).toBeDisabled();
		expect(probeHealth).toHaveBeenCalledTimes(1);
	});

	// Two servers hold two sets of tickets. The rows of the old one are not
	// rows of the new one.
	test("saving a different server drops the cached rows of the old one", async () => {
		store.set("trellis-server-url", url);
		store.set("trellis-actor-name", "navid");
		queryClient.setQueryData(["tickets", "list", {}], { items: [{ identifier: "CDE-42" }] });
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 3, actorName: "navid" });
		await renderRouter(appContext(), { initialUrl: "/setup" });
		await typeUrl("http://10.0.0.9:4521");
		await testConnection();
		expect(await screen.findByText("3 tickets")).toBeOnTheScreen();
		await fireEvent.press(save());
		expect(store.getString("trellis-server-url")).toBe("http://10.0.0.9:4521");
		// The screens can mount queries for the new server after Save. None of
		// them may hold a row of the old server.
		const oldRows = queryClient
			.getQueryCache()
			.getAll()
			.filter((query) => JSON.stringify(query.state.data ?? null).includes("CDE-42"));
		expect(queryClient.getQueryData(["tickets", "list", {}])).toBeUndefined();
		expect(oldRows).toEqual([]);
	});

	// Setup is a tab screen, so it stays mounted after the first Save takes
	// the person back to where they came from. A person who opens Server
	// again edits the same mounted screen, and the second Save must leave it
	// the way the first one did.
	test("a second save navigates back like the first", async () => {
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		const back = jest.spyOn(router, "back").mockImplementation(() => {});
		const canGoBack = jest.spyOn(router, "canGoBack").mockReturnValue(true);
		await renderRouter(appContext(), { initialUrl: "/setup" });

		await typeUrl(url);
		await typeName("navid");
		await testConnection();
		expect(await screen.findByText("12 tickets")).toBeOnTheScreen();
		await fireEvent.press(save());
		await waitFor(() => expect(back).toHaveBeenCalledTimes(1));

		const other = "http://10.0.0.9:4521";
		await typeUrl(other);
		await testConnection();
		expect(await screen.findByText("12 tickets")).toBeOnTheScreen();
		await fireEvent.press(save());
		await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
		expect(store.getString("trellis-server-url")).toBe(other);

		back.mockRestore();
		canGoBack.mockRestore();
	});

	test("Scan QR code fills the URL from a pair link and runs the probe", async () => {
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		await renderRouter(appContext(), { initialUrl: "/setup" });
		await fireEvent.press(screen.getByRole("button", { name: "Scan QR code" }));
		expect(screen.getByTestId("camera")).toBeOnTheScreen();

		await act(async () => scan(pairLink));

		expect(screen.getByLabelText("Server URL")).toHaveDisplayValue(url);
		expect(probeHealth).toHaveBeenCalledTimes(1);
		expect(probeHealth.mock.calls[0]?.[0]).toBe(url);
		expect(await screen.findByText("12 tickets")).toBeOnTheScreen();
		expect(screen.queryByTestId("camera")).toBeNull();
	});

	test("a QR code that is not a pair link fills nothing and never probes", async () => {
		await renderRouter(appContext(), { initialUrl: "/setup" });
		for (const code of [url, `otherapp://pair?url=${encodeURIComponent(url)}`, "trellis://pair?url=javascript%3A1"]) {
			await fireEvent.press(screen.getByRole("button", { name: "Scan QR code" }));
			await act(async () => scan(code));
			expect(await screen.findByText("This QR code is not a trellis pair link.")).toBeOnTheScreen();
			expect(screen.getByLabelText("Server URL")).toHaveDisplayValue("http://");
		}
		expect(probeHealth).not.toHaveBeenCalled();
	});

	test("the trellis://pair deep link opens setup with the URL filled and probes it", async () => {
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		const view = renderRouter(appContext(), { initialUrl: linkedPath });
		await view;

		await waitFor(() => expect(view.getPathname()).toBe("/setup"));
		expect(screen.getByLabelText("Server URL")).toHaveDisplayValue(url);
		expect(await screen.findByText("12 tickets")).toBeOnTheScreen();
		expect(probeHealth.mock.calls.map((call) => call[0])).toEqual([url]);
	});

	// A person who already set a server up opens a pair link for a new one.
	test("the deep link reaches setup on an app that already has a server", async () => {
		store.set("trellis-server-url", "http://10.0.0.9:4521");
		store.set("trellis-actor-name", "navid");
		probeHealth.mockResolvedValue({ ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "navid" });
		const view = renderRouter(appContext(), { initialUrl: linkedPath });
		await view;

		await waitFor(() => expect(view.getPathname()).toBe("/setup"));
		expect(screen.getByLabelText("Server URL")).toHaveDisplayValue(url);
		await fireEvent.press(await screen.findByRole("button", { name: "Save" }));
		expect(store.getString("trellis-server-url")).toBe(url);
	});

	test("a URL without a scheme never reaches the probe", async () => {
		await renderRouter(appContext(), { initialUrl: "/setup" });
		const expected = server.validateServerUrl("192.168.1.20:4521");
		if (expected.ok) throw new Error("validated a URL without a scheme");
		await typeUrl("192.168.1.20:4521");
		await testConnection();
		expect(await screen.findByText(expected.error)).toBeOnTheScreen();
		expect(probeHealth).not.toHaveBeenCalled();
		expect(save()).toBeDisabled();
	});
});
