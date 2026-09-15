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

test("a heartbeat contains only its event envelope", () => {
	const message = managerMessage(delivery);
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.heartbeat",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [],
	});
});

test("a dispatch contains its event envelope and unmodified ticket events", () => {
	const event = {
		id: 42,
		ticketId: "ticket-1",
		action: "comment.created",
		actor: { name: "navid", kind: "human" },
		createdAt: delivery.dueAt,
	};
	const message = managerMessage({ ...delivery, events: [event] });
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.dispatch",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [event],
	});
});
