import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../../renderWithProviders";
import { archiveProject } from "../../../../../rows";
import { createTestServer } from "../../../../../server";
import { findGrid, resetUi, sleep, toastWith } from "../../../../../table";
import { tableViewport } from "../../../../../viewport";
import { composerActions } from "../../../../../../src/features/composer/composerStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

afterEach(() => act(resetUi));

const dialog = () => screen.queryByRole("dialog", { name: /new ticket/i });

describe("features/composer/CreateTicketDialog on an archived project", () => {
	// An archived project takes no new ticket. The composer does not open,
	// and a toast names the project and the way out.
	test("c on the page of an archived project opens no composer", async () => {
		const server = createTestServer();
		await archiveProject(server, "TRL");
		renderApp({ path: "/p/TRL/table", actor: "dana", server });
		await findGrid();
		act(() => composerActions.open({ project: "TRL" }));
		await toastWith("TRL is archived. Unarchive the project to change it.");
		await sleep(50);
		expect(dialog()).toBeNull();
	});

	// The project picker offers only the projects that take a new ticket.
	test("the project picker leaves out every archived project", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await archiveProject(server, "TRL");
		renderApp({ path: "/all/table", actor: "dana", server });
		await findGrid();
		act(() => composerActions.open({}));
		const open = await screen.findByRole("dialog", { name: /new ticket/i });
		await user.click(within(open).getByRole("button", { name: /project/i }));
		await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
		const names = screen.getAllByRole("option").map((option) => option.textContent ?? "");
		expect(names.some((name) => name.startsWith("TRL"))).toBe(false);
		expect(names.some((name) => name.startsWith("CDE"))).toBe(true);
	});
});
