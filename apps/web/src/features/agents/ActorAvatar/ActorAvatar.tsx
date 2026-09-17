import type { ActorRef } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { isAgentWorking } from "../isAgentWorking";
import { personaKindOf } from "../personaKindOf";
import { useActorRun } from "../useActorRun";

export function ActorAvatar({ actor, ticketId }: { actor: ActorRef; ticketId: string }) {
	const run = useActorRun(actor);
	if (actor.kind === "system") return null;
	const working = run !== undefined && run.ticketId === ticketId && isAgentWorking(run);
	return (
		<Avatar
			kind={actor.kind}
			name={actor.displayName ?? actor.name}
			personaKind={run === undefined ? undefined : personaKindOf(run.kind)}
			state={working ? "working-mild" : "static"}
		/>
	);
}
