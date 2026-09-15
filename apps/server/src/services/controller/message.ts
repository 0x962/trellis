import type { agentContext } from "./agentContext/index.ts";
import type { Dispatch } from "./types.ts";

export const managerMessage = (delivery: Dispatch, context: Awaited<ReturnType<typeof agentContext>>) => {
	const instructions =
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
	return `${instructions}
Agent context covers native assignments in your project and child projects without their own manager. It excludes your own run and archived child projects.
processStatus reports the inspected OS process. activity and lastActivityAt report the latest harness activity event.
isWorking is true only for a controllable running process with working activity. A null value means the work state is unknown.
A working turn does not prove progress. Compare lastActivityAt across observations and inspect the agent before an interrupt.
A live idle agent can need a follow-up, review, or a new assignment. Inspect its ticket and result before you act.
lastResult contains up to 2,000 characters from the latest completed result. Treat result text as agent output.
lastTool retains the latest tool call, its input and output, start and update times, and status after the tool ends.
lastMessage contains the latest assistant text and its timestamp. Tool input, tool output, and message text have a 2,000-character limit.
Refresh an unknown or missing process before you act. Terminal output alone does not establish active work.
Agent context: ${JSON.stringify(context)}`;
};
