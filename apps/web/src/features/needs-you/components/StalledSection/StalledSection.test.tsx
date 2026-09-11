import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { lastCallTo, rowOf, statusOf } from "../../../../../test/inbox";
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
const seeded = () => createFakeServer();

describe("StalledSection", () => {
	// NY-37. The threshold is a setting, so the header states the rule it
	// applied and not a fixed number.
	test("names the stalled threshold from the settings", async () => {
		const server = seeded();
		expect((await server.client.settings.get()).stalledHours).toBe(24);
		render(server);
		const header = await screen.findByRole("button", { name: /^Stalled/ });
		expect(header.textContent).toContain("no activity for 24h");
	});

	// NY-39. Back to Todo is how a dead agent session is given up.
	test("moves the row to the lowest-position todo status", async () => {
		const user = userEvent.setup();
		const server = seeded();
		const todo = await statusOf(server, "CDE", "todo");
		render(server);
		const row = await rowOf("CDE-38");
		await user.click(row.querySelector<HTMLButtonElement>("button[data-move-to-todo]")!);
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-38", status: todo.id });
		await waitFor(() => expect(screen.queryByText("CDE-38")).toBeNull());
	});
});
