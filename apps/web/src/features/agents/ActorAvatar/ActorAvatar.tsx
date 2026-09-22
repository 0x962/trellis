import type { ActorRef } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { agentKindOf } from "../agentKindOf";
import { agentProfileOf } from "../agentProfileOf";
import { isAgentWorking } from "../isAgentWorking";
import { useAssignedRun } from "../useAssignedRun";

// The last actor of a ticket row. A human draws the initials. An agent draws
// the provider mark, with the model and the effort, only while an agent run
// is assigned to the ticket. The profile and the working state come from
// that run.
export function ActorAvatar({ actor, ticketId }: { actor: ActorRef; ticketId: string }) {
	const run = useAssignedRun(ticketId);
	if (actor.kind === "system") return null;
	if (actor.kind === "agent" && run === undefined) return null;
	return (
		<Avatar
			kind={actor.kind}
			name={actor.displayName ?? actor.name}
			agentKind={run === undefined ? undefined : agentKindOf(run.kind)}
			agentProfile={run === undefined ? undefined : agentProfileOf(run.harness)}
			state={run !== undefined && isAgentWorking(run) ? "working" : "static"}
		/>
	);
}
