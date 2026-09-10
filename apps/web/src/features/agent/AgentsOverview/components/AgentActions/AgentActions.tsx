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
export function AgentActions({ actions, identifiers }: AgentActionsProps) {
	if (actions.length === 0) return <p className="px-3 py-2 text-fg-faint text-sm">No agent actions yet.</p>;
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
