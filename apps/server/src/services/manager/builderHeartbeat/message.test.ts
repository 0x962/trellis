import { expect, test } from "bun:test";
import { builderHeartbeatMessage } from "./message.ts";

const candidate = {
	runId: "run-1",
	ticketId: "ticket-1",
	projectId: "project-1",
	activityState: "idle",
	activityAt: "2026-09-16T00:00:00.000Z",
};
const context = {
	ticket: { identifier: "CDE-1", title: "Build it", statusName: "In Progress", statusCategory: "started" },
	inProgress: { count: 3, limit: 9 },
	comments: [
		{
			id: "comment-1",
			body: "Go ahead.",
			actorKind: "human",
			actorDisplayName: null,
			createdAt: "2026-09-16T00:01:00.000Z",
		},
	],
};

test("a builder heartbeat carries its ticket, column fill, and latest comments", () => {
	const message = JSON.parse(builderHeartbeatMessage(candidate, context));
	expect(message).toEqual({
		type: "trellis.builder.heartbeat",
		runId: candidate.runId,
		ticketId: candidate.ticketId,
		projectId: candidate.projectId,
		ticket: context.ticket,
		inProgress: context.inProgress,
		comments: context.comments,
		activity: { state: candidate.activityState, updatedAt: candidate.activityAt },
	});
});

test("a builder heartbeat names no agent roster and no capacity", () => {
	const message = JSON.stringify(builderHeartbeatMessage(candidate, context));
	expect(message).not.toContain("agentContext");
	expect(message).not.toContain("capacity");
	expect(message).not.toContain("freeSlots");
});
