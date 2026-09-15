import { expect, test } from "bun:test";
import { workItems } from "./coordination.ts";
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
	workState: "open",
	outcomes: [],
	handledAt: null,
	events: [],
	dueAt: "2026-09-15T00:00:00.000Z",
	error: null,
};
const context = {
	policy: { personaId: "manager-policy", updatedAt: "2026-09-15T00:00:00.000Z" },
	unfinished: [],
	unfinishedCount: 0,
};

test("a heartbeat contains only its event envelope", () => {
	const message = managerMessage(delivery, context);
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.heartbeat",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [],
		workItems: workItems(delivery),
		...context,
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
	const message = managerMessage({ ...delivery, events: [event] }, context);
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.dispatch",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [event],
		workItems: workItems({ ...delivery, events: [event] }),
		...context,
	});
});

test("assignment identifiers survive a retry generation and completed tickets leave the work list", () => {
	const events = ["one", "two", "one"].map((ticketId, id) => ({
		id,
		ticketId,
		action: "ticket.updated",
		actor: { name: "test", kind: "human" },
		createdAt: delivery.dueAt,
	}));
	const first = workItems({ ...delivery, events });
	expect(first).toHaveLength(2);
	expect(first[0]!.assignmentRequestId).toMatch(/^[a-f0-9-]{36}$/);
	expect(
		workItems({ ...delivery, events, outcomes: [{ ticketId: "one", status: "queued", reason: "Capacity is full." }] }),
	).toEqual([first[1]!]);
	const next = JSON.parse(managerMessage({ ...delivery, generation: 8, events }, context));
	expect(next.workItems).toEqual(first);
});
