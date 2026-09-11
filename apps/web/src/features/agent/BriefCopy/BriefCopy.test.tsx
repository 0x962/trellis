import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mod } from "../../../../test/keyboard";
import { createTestServer } from "../../../../test/server";
import { renderTicket } from "../../../../test/ticketHost";
import { BriefCopy } from "./BriefCopy";

beforeEach(() => localStorage.clear());

describe("features/agent/BriefCopy", () => {
	// WT-95. The brief is the markdown `trellis brief CDE-42` prints.
	test("Cmd+Shift+B copies the brief markdown", async () => {
		userEvent.setup();
		const server = createTestServer();
		const { markdown } = await server.client.brief.get({ ticket: "CDE-42" });
		renderTicket("CDE-42", (ticket) => <BriefCopy ticket={ticket} />, { path: "/t/CDE-42", server });
		await waitFor(() => expect(server.callsTo("tickets.get")).toHaveLength(1));
		mod("b", { shiftKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(markdown));
		expect(await screen.findByText(/Copied/)).toBeDefined();
	});
});
