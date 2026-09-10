import type { Activity } from "@trellis/api";
import { ActorChip } from "@trellis/ui";
import { isLiveActor } from "../../../../../lib/actorLive";
import { compactRelativeTime } from "../../../../../lib/format";
import { describeActivity } from "../../utils/describeActivity";

export type ActivityLineProps = {
	item: Activity;
};

// One 32 px line: the actor, the verb phrase, and the time. The phrase
// starts with a space, so the line reads as one sentence.
export function ActivityLine({ item }: ActivityLineProps) {
	const actor = item.actor;
	return (
		<li data-kind="activity" className="flex h-8 items-center gap-2 text-sm text-fg-muted">
			{actor.kind !== "system" && (
				<ActorChip name={actor.name} kind={actor.kind} live={isLiveActor({ kind: actor.kind, at: item.createdAt })} />
			)}
			<span className="min-w-0 truncate"> {describeActivity(item)}</span>
			<time dateTime={item.createdAt} className="ml-auto shrink-0 text-fg-muted tabular">
				{compactRelativeTime(item.createdAt)}
			</time>
		</li>
	);
}
