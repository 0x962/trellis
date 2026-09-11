import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import { calls, findGrid, resetUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";
import { composerActions } from "../composerStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

afterEach(() => act(resetUi));

const open = async (server = createFakeServer()) => {
	const app = renderApp({ path: "/p/CDE/table", actor: "navid", server });
	await findGrid();
	act(() => composerActions.open({}));
	const dialog = await screen.findByRole("dialog", { name: "New ticket" });
	const title = () => within(dialog).getByRole("textbox", { name: /title/i }) as HTMLInputElement;
	return { ...app, dialog, title };
};

describe("features/composer/CreateTicketDialog header and footer", () => {
	// Spec T7: one primary button. Escape closes, so Cancel goes, and a
	// Create more switch replaces the second create button.
	test("the footer holds one Create button and a Create more switch", async () => {
		const { dialog, title } = await open();
		expect(title().placeholder).toBe("Ticket title");
		const buttons = within(dialog)
			.getAllByRole("button")
			.map((button) => button.textContent?.trim());
		expect(buttons.filter((name) => name?.startsWith("Create"))).toHaveLength(1);
		expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
		expect(within(dialog).queryByRole("button", { name: /add another/i })).toBeNull();
		expect(within(dialog).getByRole("switch", { name: "Create more" })).toBeDefined();
	});

	// The header row shows the project and a close button in place of the
	// visible title. The dialog keeps "New ticket" as its name.
	test("the header shows the project chip and a Close button", async () => {
		const user = userEvent.setup();
		const { dialog } = await open();
		const header = dialog.querySelector("[data-composer-header]") as HTMLElement;
		expect(header.textContent).toContain("CDE");
		expect(header.textContent).toContain("New ticket");
		await user.click(within(header).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "New ticket" })).toBeNull());
	});

	// With Create more on, a create keeps the dialog open for the next
	// ticket and empties the title.
	test("Create more keeps the dialog open after a create", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const { dialog, title } = await open(server);
		await user.click(within(dialog).getByRole("switch", { name: "Create more" }));
		await user.type(title(), "First of two");
		await user.click(within(dialog).getByRole("button", { name: /^Create/ }));
		await waitFor(() => expect(calls(server, "tickets.create")).toHaveLength(1));
		await waitFor(() => expect(title().value).toBe(""));
		expect(screen.getByRole("dialog", { name: "New ticket" })).toBeDefined();
	});
});
