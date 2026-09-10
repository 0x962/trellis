import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../../../test/fake-server";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { settle } from "../../../../../../test/ticketHost";
import { PrRow } from "../PrRow";
import { DiffPanel } from "./DiffPanel";

describe("features/ticket/PullRequests/components/DiffPanel", () => {
	// WT-68. The diff renderer arrives in M4. Until then the panel names the
	// milestone and calls nothing.
	test("the diff panel shows the M4 placeholder and calls nothing", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const pr = ticket.prs[0]!;
		const view = renderWithProviders(<PrRow pr={pr} ticket={ticket} />, { path: "/t/CDE-42", actor: "navid", server });
		const row = screen.getByRole("button", { name: /#118/ });
		await user.click(row);
		await waitFor(() => expect(row.getAttribute("aria-expanded")).toBe("true"));
		await user.click(await screen.findByRole("button", { name: "Show diff" }));
		expect(await screen.findByText(/M4/)).toBeDefined();
		await settle();
		expect(server.callsTo("pullRequests.diff")).toHaveLength(0);
		view.unmount();
		renderWithProviders(<DiffPanel pr={pr} />, { path: "/t/CDE-42", actor: "navid", server });
		expect(await screen.findByText(/M4/)).toBeDefined();
		await settle();
		expect(server.callsTo("pullRequests.diff")).toHaveLength(0);
	});
});
