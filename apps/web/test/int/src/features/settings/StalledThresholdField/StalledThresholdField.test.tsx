import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { callsTo, lastCallTo } from "../../../../../inbox";
import { mockMatchMedia } from "../../../../../media";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../server";
import { StalledThresholdField } from "../../../../../../src/features/settings/StalledThresholdField/StalledThresholdField";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: TestServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<StalledThresholdField />
		</>,
		{ path: "/settings", actor: "dana", server },
	);

const field = () => screen.findByRole("spinbutton", { name: /stalled/i });

const save = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
	const input = await field();
	await user.clear(input);
	await user.type(input, value);
	await user.tab();
	return input as HTMLInputElement;
};

describe("StalledThresholdField", () => {
	// ST-09. A zero threshold would call every started ticket stalled.
	test("saves a positive threshold and blocks zero", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const saved = await server.client.settings.get();
		render(server);
		await save(user, "0");
		expect(await screen.findByText("Enter a number of hours above zero.")).toBeDefined();
		expect(callsTo(server, "settings.set")).toHaveLength(0);
		await save(user, "12");
		await waitFor(() => expect(lastCallTo(server, "settings.set")).toBeDefined());
		expect(lastCallTo(server, "settings.set")!.input).toEqual({ ...saved, stalledHours: 12 });
	});

	// ST-10. The Stalled section is a server-side query over the threshold,
	// so the inbox must be read again.
	test("invalidates the inbox after a threshold save", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { queryClient, orpc } = render(server);
		await queryClient.fetchQuery(orpc.inbox.get.queryOptions({ input: {} }));
		const before = callsTo(server, "inbox.get").length;
		await save(user, "12");
		await waitFor(() => expect(callsTo(server, "inbox.get").length).toBe(before + 1));
	});
});
