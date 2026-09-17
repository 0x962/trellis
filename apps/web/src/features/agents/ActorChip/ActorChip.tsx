import type { ActorRef } from "@trellis/api";
import { ActorChip as ActorChipView } from "@trellis/ui";
import { agentKindOf } from "../agentKindOf";
import { useActorRun } from "../useActorRun";

export function ActorChip({
	actor,
	compact = false,
	className,
}: {
	actor: ActorRef;
	compact?: boolean;
	className?: string;
}) {
	const run = useActorRun(actor);
	if (actor.kind === "system") return null;
	return (
		<ActorChipView
			name={actor.displayName ?? actor.name}
			kind={actor.kind}
			agentKind={run === undefined ? undefined : agentKindOf(run.kind)}
			compact={compact}
			className={className}
		/>
	);
}
