import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestServer } from "../../../../test/server";
import { renderTicket, settle } from "../../../../test/ticketHost";
import { TicketView } from "./TicketView";

beforeEach(() => localStorage.clear());

const archivedServer = () => {
	const server = createTestServer();
	[...server.state.projects.values()].find((entry) => entry.path === "CDE")!.archivedAt = new Date().toISOString();
	return server;
};

const page = (server: ReturnType<typeof createTestServer>) =>
	renderTicket("CDE-42", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
		path: "/t/CDE-42",
		server,
	});

describe("features/ticket/TicketView in an archived project", () => {
	// The server refuses every write to a ticket under an archived project.
	// The page and the peek show the ticket read-only: every control is
	// disabled, and a notice names the project.
	test("disables the title and every picker, and says why", async () => {
		page(archivedServer());
		// The browser disables every control inside a disabled fieldset,
		// whatever the control's own disabled attribute says. happy-dom does
		// not apply that rule to :disabled, so the test finds the fieldset.
		const disabled = (element: Element) => element.closest("fieldset:disabled") !== null;
		const title = await screen.findByRole("textbox", { name: "Title" });
		await waitFor(() => expect(disabled(title)).toBe(true));
		expect(screen.getByText("CDE/web is archived. Unarchive the project to change it.")).toBeDefined();
		const rail = screen.getByLabelText("Properties");
		for (const button of rail.querySelectorAll("button")) expect(disabled(button)).toBe(true);
	});

	// The keys that start an edit open nothing: s, p, m, Shift+P, and e.
	test("the edit keys open no picker and no editor", async () => {
		const user = userEvent.setup();
		page(archivedServer());
		await screen.findByRole("textbox", { name: "Title" });
		await waitFor(() => expect(screen.getByText(/is archived/)).toBeDefined());
		for (const key of ["s", "p", "m", "{Shift>}P{/Shift}", "e"]) {
			await user.keyboard(key);
			await settle();
			expect(screen.queryByRole("dialog")).toBeNull();
			expect(document.querySelector('.ProseMirror[contenteditable="true"]')).toBeNull();
		}
	});
});
