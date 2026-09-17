import { useQuery } from "@tanstack/react-query";
import type { ActorRef } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { isAgentWorking } from "../isAgentWorking";
import { personaKindOf } from "../personaKindOf";

export function ActorAvatar({ actor, ticketId }: { actor: ActorRef; ticketId: string }) {
	const { orpc } = useApp();
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: {} }),
		enabled: actor.kind === "agent",
		select: (items) => items.find((item) => item.name === actor.name),
	});
	if (actor.kind === "system") return null;
	const run = actor.kind === "agent" ? runs.data : undefined;
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
