import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { createMMKV } from "react-native-mmkv";
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
