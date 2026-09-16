import type { BuilderHeartbeatCandidate, BuilderHeartbeatContext } from "./collect.ts";

export const builderHeartbeatMessage = (
	candidate: Pick<BuilderHeartbeatCandidate, "runId" | "ticketId" | "projectId" | "activityState" | "activityAt">,
	context: BuilderHeartbeatContext,
) =>
	JSON.stringify({
		type: "trellis.builder.heartbeat",
		runId: candidate.runId,
		ticketId: candidate.ticketId,
		projectId: candidate.projectId,
		ticket: context.ticket,
		inProgress: context.inProgress,
		comments: context.comments,
		activity: { state: candidate.activityState, updatedAt: candidate.activityAt },
	});
