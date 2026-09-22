import { Avatar } from "@trellis/ui";
import { agentKindOf } from "../agentKindOf";
import { agentProfileOf } from "../agentProfileOf";
import { isAgentWorking } from "../isAgentWorking";
import { useAssignedRun } from "../useAssignedRun";

// The agent run assigned to the ticket. Tickets do not belong to a person,
// so this component never draws a human actor.
export function ActorAvatar({ ticketId }: { ticketId: string }) {
	const run = useAssignedRun(ticketId);
	if (run === undefined) return null;
	return (
		<Avatar
			kind="agent"
			name={run.name}
			agentKind={agentKindOf(run.kind)}
			agentProfile={agentProfileOf(run.harness)}
			state={isAgentWorking(run) ? "working" : "static"}
		/>
	);
}
