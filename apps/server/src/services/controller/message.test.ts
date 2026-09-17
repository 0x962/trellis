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
	nextActions: [],
	handledAt: null,
	events: [],
	dueAt: "2026-09-15T00:00:00.000Z",
	error: null,
};
const agents = { observedAt: delivery.dueAt, agents: [] };
const context = {
	policy: { personaId: "manager-policy", updatedAt: "2026-09-15T00:00:00.000Z" },
	unfinished: [],
	unfinishedCount: 0,
};

test("a heartbeat includes coordination and current agent observations", () => {
	const message = managerMessage(delivery, context, agents);
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.heartbeat",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [],
		nextActions: [],
		workItems: workItems(delivery),
		...context,
		agentContext: agents,
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
	const message = managerMessage({ ...delivery, events: [event] }, context, agents);
	expect(JSON.parse(message)).toEqual({
		type: "trellis.manager.dispatch",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: [event],
		nextActions: [],
		workItems: workItems({ ...delivery, events: [event] }),
		...context,
		agentContext: agents,
	});
});

test("a project event yields one project work item", () => {
	const event = {
		id: 7,
		ticketId: null,
		action: "project.subproject_manager_enabled",
		actor: { name: "navid", kind: "human" },
		createdAt: delivery.dueAt,
		project: { id: "child-1", path: "CDE.web" },
	};
	const message = JSON.parse(managerMessage({ ...delivery, events: [event] }, context, agents));
	expect(message.type).toBe("trellis.manager.dispatch");
	expect(message.events).toEqual([event]);
	expect(message.workItems).toEqual([{ ticketId: null, assignmentRequestId: expect.any(String) }]);
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
	const next = JSON.parse(managerMessage({ ...delivery, generation: 8, events }, context, agents));
	expect(next.workItems).toEqual(first);
});

test("a ready wake names its ticket and keeps the saved assignment identity", () => {
	const message = JSON.parse(
		managerMessage(
			{
				...delivery,
				nextActions: [
					{
						id: "action",
						projectId: delivery.projectId,
						ticketId: "ticket",
						assignmentRequestId: "original-request",
						reason: "Start its reviewer.",
						wakeCondition: "ready",
						state: "waiting",
						runId: null,
						createdAt: delivery.dueAt,
						eligibleAt: delivery.dueAt,
						assignedAt: null,
					},
				],
			},
			context,
			agents,
		),
	);
	expect(message.type).toBe("trellis.manager.dispatch");
	expect(message.workItems).toEqual([{ ticketId: "ticket", assignmentRequestId: "original-request" }]);
	expect(message.nextActions[0].reason).toBe("Start its reviewer.");
});
