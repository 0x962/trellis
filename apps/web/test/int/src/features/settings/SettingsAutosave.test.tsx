import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import type { ReactElement } from "react";
import { ActorNameField } from "../../../../../src/features/settings/ActorNameField";
import { DiffTemplateField } from "../../../../../src/features/settings/DiffTemplateField";
import { StalledThresholdField } from "../../../../../src/features/settings/StalledThresholdField";
import { mockMatchMedia } from "../../../../media";
import { renderWithProviders } from "../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../server";
import { settle } from "../../../../ticketHost";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (field: ReactElement, server: TestServer) =>
	renderWithProviders(
		<>
			<Toaster />
			{field}
		</>,
		{ path: "/settings", actor: "dana", server },
	);

const saves = (server: TestServer) => server.calls.filter((call) => call.path.join(".") === "settings.set");

// The row of a field: the element that holds the field and its Saved mark.
const rowOf = (field: HTMLElement) => field.closest("[data-settings-row]") as HTMLElement;

// Spec ST-4. Every field saves on blur and shows "Saved" beside itself.
// There is no Save button and no toast for a save.
describe("settings autosave", () => {
	test("the diff template has no Save button and saves on blur", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		render(<DiffTemplateField />, server);
		const field = await screen.findByRole("textbox", { name: /diff url template/i });
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		await user.clear(field);
		await user.type(field, "http://diff.localhost/{{url}");
		await user.tab();
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect((saves(server)[0]!.input as { diffUrlTemplate: string }).diffUrlTemplate).toBe(
			"http://diff.localhost/{url}",
		);
		expect(await within(rowOf(field)).findByText("Saved")).toBeDefined();
		await settle(50);
		expect(screen.queryByText("Settings saved")).toBeNull();
	});

	test("the name shows Saved after its save", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		render(<ActorNameField />, server);
		const field = await screen.findByRole("textbox", { name: "Your name" });
		await user.clear(field);
		await user.type(field, "Dana K");
		await user.tab();
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(await within(rowOf(field)).findByText("Saved")).toBeDefined();
		expect(screen.queryByText("Settings saved")).toBeNull();
	});

	test("the stalled hours show Saved after their save", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		render(<StalledThresholdField />, server);
		const field = await screen.findByRole("spinbutton", { name: /stalled after/i });
		await user.clear(field);
		await user.type(field, "12");
		await user.tab();
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(await within(rowOf(field)).findByText("Saved")).toBeDefined();
		expect(screen.queryByText("Settings saved")).toBeNull();
	});

	// A blur with no change sends nothing and claims nothing.
	test("a blur with no change saves nothing", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		render(<DiffTemplateField />, server);
		const field = await screen.findByRole("textbox", { name: /diff url template/i });
		await user.click(field);
		await user.tab();
		await settle(50);
		expect(saves(server)).toHaveLength(0);
		expect(within(rowOf(field)).queryByText("Saved")).toBeNull();
	});
});
