import type { ActorRef } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { agentKindOf } from "../agentKindOf";
import { agentProfileOf } from "../agentProfileOf";
import { isAgentWorking } from "../isAgentWorking";
import { useActorRun } from "../useActorRun";

export function ActorAvatar({ actor, ticketId }: { actor: ActorRef; ticketId: string }) {
	const run = useActorRun(actor);
	if (actor.kind === "system") return null;
	const working = run !== undefined && run.ticketId === ticketId && isAgentWorking(run);
	return (
		<Avatar
			kind={actor.kind}
			name={actor.displayName ?? actor.name}
			agentKind={run === undefined ? undefined : agentKindOf(run.kind)}
			agentProfile={agentProfileOf(run?.harness)}
			state={working ? "working-mild" : "static"}
		/>
	);
}
