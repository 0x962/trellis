import type { AgentRun } from "@trellis/api";
import { Avatar, cx, GroupHeader, useMediaQuery } from "@trellis/ui";
import { useId } from "react";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { isAgentWorking } from "../../../../agents/isAgentWorking";

export function SessionGroup({
	group,
	label,
	projectPath,
	runs,
	selectedId,
	onSelect,
}: {
	group: string;
	label: string;
	projectPath: string;
	runs: AgentRun[];
	selectedId?: string;
	onSelect: (id: string) => void;
}) {
	const contentId = useId();
	const routeKey = `/sessions/project/${projectPath}`;
	const collapsed = useUiStore((state) => state.collapsedGroups[routeKey]?.includes(group) ?? false);
	const phone = useMediaQuery("(max-width: 767px)");
	return (
		<section aria-label={`${label} sessions`}>
			<GroupHeader
				group={group}
				label={label}
				count={runs.length}
				expanded={!collapsed}
				onToggle={() => uiActions.toggleGroup(routeKey, group)}
				phone={phone}
				controls={contentId}
				sticky
			/>
			<div id={contentId} hidden={collapsed}>
				{runs.length === 0 && <p className="px-3 py-2 text-sm text-fg-faint">No sessions</p>}
				<ul className="flex flex-col">
					{runs.map((run) => (
						<li key={run.id}>
							<button
								type="button"
								title={`${run.ticketIdentifier ?? run.name} · ${run.state} · ${run.createdAt}`}
								aria-current={selectedId === run.id ? "page" : undefined}
								className={cx(
									"sidebar-row w-full text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent",
									selectedId === run.id && "sidebar-selected",
								)}
								onClick={() => onSelect(run.id)}
							>
								<Avatar
									kind="agent"
									name={run.ticketIdentifier ?? run.name}
									agentKind={agentKindOf(run.kind)}
									agentProfile={agentProfileOf(run.harness)}
									state={isAgentWorking(run) ? "working" : "static"}
									className="size-5 shrink-0"
								/>
								<span className="sidebar-label tabular">{run.ticketIdentifier ?? run.name}</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
