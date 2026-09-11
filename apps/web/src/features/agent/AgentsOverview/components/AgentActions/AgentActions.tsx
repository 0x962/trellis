import type { Activity } from "@trellis/api";
import { ActorChip } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { describeActivity } from "../../../../ticket/Timeline/utils/describeActivity";

export type AgentActionsProps = {
	actions: Activity[];
	// The identifier of each ticket the actions name.
	identifiers: Map<string, string>;
};

// The last writes of the manager, builder, and reviewer agents, newest
// first. Each line names the agent, its ticket, and what it changed.
//
// The source is the activity of an actor named `manager-`, `builder-`, or
// `reviewer-`, which is what an agent that trellis itself runs writes as.
// An agent started from a persona writes as `agent:<run id>`, so it never
// lands here. The empty state says so, because the Sessions list above can
// hold agents that this list cannot.
export function AgentActions({ actions, identifiers }: AgentActionsProps) {
	if (actions.length === 0) {
		return (
			<div className="flex flex-col gap-1 px-3 py-2 text-fg-faint text-sm">
				<p>No agent actions yet.</p>
				<p>
					This list holds the manager, builder, and reviewer agents that trellis itself runs. An agent started from a
					persona writes under its run id, so it has no line here.
				</p>
			</div>
		);
	}
	return (
		<ul aria-label="Agent actions" className="flex flex-col">
			{actions.map((action) => (
				<li key={action.id} className="flex h-8 items-center gap-2 px-3 text-fg-muted text-sm">
					{action.actor.kind !== "system" && (
						<ActorChip name={action.actor.name} kind={action.actor.kind} live={false} />
					)}
					{action.ticketId !== null && (
						<span className="font-mono text-fg text-xs">{identifiers.get(action.ticketId)}</span>
					)}
					<span className="min-w-0 truncate">{describeActivity(action)}</span>
					<time dateTime={action.createdAt} className="ml-auto shrink-0 text-fg-faint tabular">
						{compactRelativeTime(action.createdAt)}
					</time>
				</li>
			))}
		</ul>
	);
}
