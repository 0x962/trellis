import type { Ticket } from "@trellis/api";
import { createTestServer, type TestServer } from "./server/index.ts";
import { ago, hour } from "./ticketHost";

// The version the outcomes name for CDE-42. The seed leaves the row lower, so
// the title is written back and forth until the row reaches it.
const TARGET = 17;

export const serverAt17 = () =>
	createTestServer({
		prepare: async (client) => {
			const start = await client.tickets.get({ ticket: "CDE-42" });
			for (let version = start.version; version < TARGET; version += 1) {
				const title = version === TARGET - 1 ? start.title : `${start.title} (${version})`;
				await client.tickets.update({ ticket: "CDE-42", title });
			}
		},
	});

// The conflict the server reports: the row moved to the next version under
// the agent's hand.
export const conflictAt18 = async (server: TestServer): Promise<Ticket> => {
	const current = await server.client.tickets.get({ ticket: "CDE-42" });
	return {
		...current,
		version: TARGET + 1,
		title: "Restore the fork pages (agent edit)",
		lastActor: { name: "claude-code", kind: "agent", at: ago(hour) },
	};
};
