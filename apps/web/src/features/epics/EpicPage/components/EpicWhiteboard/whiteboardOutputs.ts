import { type AgentRun, type AgentRunPullRequest, askedForReview, type Epic, sessionStatus } from "@trellis/api";
import type { EpicWhiteboardProps } from "@trellis/ui/epic-whiteboard";
import { agentMarkState } from "../../../../agents/agentMarkState";
import { agentProfileOf } from "../../../../agents/agentProfileOf";

export function whiteboardOutputs(
	epic: Epic,
	runs: readonly AgentRun[],
	runPullRequests: readonly AgentRunPullRequest[],
) {
	const outputs = new Map<string, EpicWhiteboardProps["outputs"][number]>();
	const links: EpicWhiteboardProps["outputLinks"][number][] = [];
	const ticketIds = new Set(epic.tickets.map((ticket) => ticket.id));
	for (const ticket of epic.tickets) {
		if (ticket.parent && ticketIds.has(ticket.parent.id))
			links.push({
				from: { kind: "ticket", id: ticket.parent.id },
				to: { kind: "ticket", id: ticket.id },
				label: "Sub-ticket",
			});
		for (const pr of ticket.prRows) {
			const id = `pr:${pr.id}`;
			outputs.set(id, {
				id,
				kind: "pull-request",
				label: `${pr.repo}#${pr.number}`,
				title: pr.title,
				url: pr.url,
				state: pr.state,
				askedForReview: askedForReview(pr),
				locallyApproved: pr.verdict === "approved",
			});
			links.push({ from: { kind: "ticket", id: ticket.id }, to: { kind: "output", id }, label: "Pull request" });
		}
	}
	for (const run of runs) {
		if (run.ticketId && ticketIds.has(run.ticketId))
			links.push({ from: { kind: "ticket", id: run.ticketId }, to: { kind: "session", id: run.id }, label: "Session" });
	}
	for (const { runId, pullRequest: pr } of runPullRequests) {
		const id = `pr:${pr.id}`;
		outputs.set(id, {
			id,
			kind: "pull-request",
			label: `${pr.repo}#${pr.number}`,
			title: pr.title,
			url: pr.url,
			state: pr.state,
			askedForReview: pr.localState === "ready",
			locallyApproved: pr.localVerdict === "approved",
		});
		links.push({ from: { kind: "session", id: runId }, to: { kind: "output", id }, label: "Pull request" });
	}
	return {
		outputs: [...outputs.values()],
		links,
		sessions: runs.map((run) => ({
			id: run.id,
			label: run.name,
			profile: agentProfileOf(run.harness),
			state: agentMarkState(run),
			status: sessionStatus(run),
		})),
	};
}
