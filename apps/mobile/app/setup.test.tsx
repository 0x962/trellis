import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { createMMKV } from "react-native-mmkv";
import { queryClient } from "../src/lib/queryClient";
import * as server from "../src/lib/server";
import { appContext } from "../test/appContext";

jest.mock("../src/lib/server", () => ({
	...jest.requireActual<typeof server>("../src/lib/server"),
	probeHealth: jest.fn(),
}));

const probeHealth = jest.mocked(server.probeHealth);
const store = createMMKV();
const url = "http://192.168.1.20:4521";

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
		expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
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
