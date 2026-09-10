import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { lastCallTo, mockClipboard, rowOf, setTemplate, statusOf } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { StalledSection } from "./StalledSection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<StalledSection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

// The seed leaves CDE-38 in progress and quiet for two days.
const seeded = async () => {
	const server = createFakeServer();
	await setTemplate(server, 'claude "{brief}"');
	return server;
};

describe("StalledSection", () => {
	// NY-37. The threshold is a setting, so the header states the rule it
	// applied and not a fixed number.
	test("names the stalled threshold from the settings", async () => {
		const server = await seeded();
		expect((await server.client.settings.get()).stalledHours).toBe(24);
		render(server);
		const header = await screen.findByRole("button", { name: /^Stalled/ });
		expect(header.textContent).toContain("no activity for 24h");
	});

	// NY-38. Nothing failed here, so the command carries no check clause.
	test("copies the plain agent command", async () => {
		const user = userEvent.setup();
		const clipboard = mockClipboard();
		render(await seeded());
		const row = await rowOf("CDE-38");
		await user.click(row.querySelector<HTMLButtonElement>("button[data-start-with-agent]")!);
		await waitFor(() => expect(clipboard.written).toEqual(['claude "$(trellis brief CDE-38)"']));
	});

	// NY-39. Back to Todo is how a dead agent session is given up.
	test("moves the row to the lowest-position todo status", async () => {
		const user = userEvent.setup();
		const server = await seeded();
		const todo = await statusOf(server, "CDE", "todo");
		render(server);
		const row = await rowOf("CDE-38");
		await user.click(row.querySelector<HTMLButtonElement>("button[data-move-to-todo]")!);
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-38", status: todo.id });
		await waitFor(() => expect(screen.queryByText("CDE-38")).toBeNull());
	});
});
