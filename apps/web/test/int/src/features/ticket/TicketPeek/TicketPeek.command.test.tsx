import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { mockMatchMedia } from "../../../../../media";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { commandActions, useCommandStore } from "../../../../../../src/features/command/commandStore";
import { PeekListProvider } from "../../../../../../src/features/ticket/TicketPeek/providers/PeekListProvider";
import { TicketPeek } from "../../../../../../src/features/ticket/TicketPeek/TicketPeek";

const rows = ["CDE-44", "CDE-42"].map((identifier) => ({ identifier, visible: true }));

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	window.innerWidth = 1280;
	commandActions.reset();
});

describe("features/ticket/TicketPeek: command context", () => {
	// The palette's This ticket section acts on the ticket the peek shows.
	test("the open peek names its ticket to the command palette and clears it on unmount", async () => {
		const view = renderWithProviders(
			<PeekListProvider rows={rows}>
				<TicketPeek />
			</PeekListProvider>,
			{ path: "/p/CDE/table?peek=CDE-42", actor: "dana" },
		);
		await screen.findByRole("dialog", { name: "CDE-42" });
		await waitFor(() => expect(useCommandStore.getState().peekTicket).toBe("CDE-42"));
		view.unmount();
		expect(useCommandStore.getState().peekTicket).toBeNull();
	});
});
