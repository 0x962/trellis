import type { ActorRef } from "@trellis/api";
import { ActorChip as ActorChipView } from "@trellis/ui";
import { personaKindOf } from "../personaKindOf";
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
			personaKind={run === undefined ? undefined : personaKindOf(run.kind)}
			compact={compact}
			className={className}
		/>
	);
}
