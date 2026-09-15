import { expect, test } from "bun:test";
import { managerMessage } from "./message.ts";
import type { Dispatch } from "./types.ts";

const delivery: Dispatch = {
	id: "dispatch-1",
	projectId: "project-1",
	runId: "manager-1",
	terminalId: "attempt-1",
	sessionId: "session-1",
	generation: 2,
	state: "sending",
	events: [],
	dueAt: "2026-09-15T00:00:00.000Z",
	error: null,
};
const context = { observedAt: delivery.dueAt, agents: [] };

test("an empty dispatch wakes the manager without inventing ticket changes", () => {
	const message = managerMessage(delivery, context);
	expect(message).toStartWith("trellis: Manager heartbeat dispatch-1, generation 2.");
	expect(message).toContain("current manager persona");
	expect(message).toContain("Do not post a comment just to acknowledge this heartbeat.");
	expect(message).not.toContain("0 ticket changes");
	expect(message).toContain(`Agent context: ${JSON.stringify(context)}`);
	expect(message).toContain("Terminal output alone does not establish active work.");
});

test("ticket activity keeps its identifiers and dispatch instructions", () => {
	const event = {
		id: 42,
		ticketId: "ticket-1",
		action: "comment.created",
		actor: { name: "navid", kind: "human" },
		createdAt: delivery.dueAt,
	};
	const message = managerMessage({ ...delivery, events: [event] }, context);
	expect(message).toStartWith("trellis: Manager dispatch dispatch-1, generation 2.");
	expect(message).toContain("1 ticket changes");
	expect(message).toContain(JSON.stringify([event]));
	expect(message).toContain("stable --request-id");
	expect(message).toContain(`Agent context: ${JSON.stringify(context)}`);
});
