import type { Ticket } from "@trellis/api";
import { createFakeServer, type FakeServer } from "./fake-server";
import { findTicket } from "./fake-server/state";
import { ago, hour } from "./ticketHost";

// CDE-42 at version 17, the version the outcomes name.
export const serverAt17 = () => {
	const server = createFakeServer();
	findTicket(server.state, "CDE-42")!.version = 17;
	return server;
};

// The conflict the server reports: the row moved to version 18 under the
// agent's hand.
export const conflictAt18 = async (server: FakeServer): Promise<Ticket> => {
	const current = await server.client.tickets.get({ ticket: "CDE-42" });
	return {
		...current,
		version: 18,
		title: "Restore the fork pages (agent edit)",
		lastActor: { name: "claude-code", kind: "agent", at: ago(hour) },
	};
};
