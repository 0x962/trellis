import type { Activity } from "@trellis/api";
import { ActorChip } from "@trellis/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { isLiveActor } from "../../../../../lib/actorLive";
import { compactRelativeTime } from "../../../../../lib/format";
import { describeRun } from "../../utils/describeActivity";
import { ActivityLine } from "../ActivityLine";

export type RunLineProps = {
	// Two or more activity rows by one actor within five minutes, oldest first.
	items: readonly Activity[];
	// Who reviews in the status with this name, for the opened rows.
	reviewer?: (statusName: string) => "human" | "agent";
};

// A run of changes as one line with the count. A click opens the rows.
export function RunLine({ items, reviewer }: RunLineProps) {
	const [open, setOpen] = useState(false);
	const last = items[items.length - 1]!;
	const actor = last.actor;
	if (open) return items.map((item) => <ActivityLine key={item.id} item={item} reviewer={reviewer} />);
	const Chevron = open ? ChevronDown : ChevronRight;
	return (
		<li data-kind="activity" className="flex h-8 items-center gap-2 text-sm text-fg-muted">
			{actor.kind !== "system" && (
				<ActorChip
					compact
					name={actor.name}
					kind={actor.kind}
					live={isLiveActor({ kind: actor.kind, at: last.createdAt })}
				/>
			)}
			<span className="min-w-0 truncate"> {describeRun(items)}</span>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(true)}
				className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-sm px-1 text-xs text-fg-muted hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
			>
				<Chevron className="size-3" aria-hidden="true" />
				{items.length} changes
			</button>
			<time dateTime={last.createdAt} className="ml-auto shrink-0 text-fg-muted tabular">
				{compactRelativeTime(last.createdAt)}
			</time>
		</li>
	);
}
