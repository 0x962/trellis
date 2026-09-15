import type { Dispatch } from "./types.ts";

export const managerMessage = (delivery: Dispatch) =>
	delivery.events.length === 0
		? `trellis: Manager heartbeat ${delivery.id}, generation ${delivery.generation}.
Recheck project ${delivery.projectId}, even when no ticket event arrives.
Read your current manager persona, project status descriptions, tickets, comments, pull requests, and agents with the trellis CLI.
Refresh relevant agents and continue eligible work under those instructions. Delegate code changes to builders.
Do not start a second active agent for an assignment. Use a stable --request-id for each worker assignment.
Respect tickets that wait for a human decision. Do not repeat unchanged questions or blockers.
Do not post a comment just to acknowledge this heartbeat. Comment only when the human needs a result, a new blocker, or a question.`
		: `trellis: Manager dispatch ${delivery.id}, generation ${delivery.generation}.
${delivery.events.length} ticket changes need your attention in project ${delivery.projectId}.
Read the affected tickets and their comments with the trellis CLI. Continue available work and report concrete results.
Do not start a second agent for an assignment that already has an active agent.
Use a stable --request-id for each worker assignment. Reuse it when a start result is uncertain.
Events: ${JSON.stringify(delivery.events)}`;
