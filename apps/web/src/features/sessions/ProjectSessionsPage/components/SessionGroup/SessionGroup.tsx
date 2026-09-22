import { ArrowDown } from "@phosphor-icons/react";
import { type AgentRun, type Session, sessionStatus } from "@trellis/api";
import { Avatar, GroupHeader, IconButton, Tooltip, useMediaQuery } from "@trellis/ui";
import { useEffect, useId, useRef, useState } from "react";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { isAgentWorking } from "../../../../agents/isAgentWorking";
import { SessionActionsMenu } from "../../../SessionActionsMenu";
import { sessionStateLabel } from "../../../sessionStateLabel";
import { isHistoricalSession } from "../../isHistoricalSession";
import { RunLineChanges } from "./components/RunLineChanges";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

export function SessionGroup({
	group,
	label,
	projectPath,
	runs,
	sessionsByRunId,
	selectedId,
	onSelect,
	searching = false,
}: {
	group: string;
	label: string;
	projectPath: string;
	runs: AgentRun[];
	sessionsByRunId: Map<string, Session>;
	selectedId?: string;
	onSelect: (id: string) => void;
	searching?: boolean;
}) {
	const contentId = useId();
	const routeKey = `/sessions/project/${projectPath}`;
	const collapsed = useUiStore((state) => state.collapsedGroups[routeKey]?.includes(group) ?? false);
	const phone = useMediaQuery("(max-width: 767px)");
	const [limit, setLimit] = useState(30);
	const selectedButton = useRef<HTMLButtonElement>(null);
	const selected = runs.find((run) => run.id === selectedId);
	const revealId = selected?.id;
	useEffect(() => {
		if (revealId || searching) uiActions.setGroupCollapsed(routeKey, group, false);
	}, [revealId, routeKey, group, searching]);
	useEffect(() => {
		if (revealId && !collapsed) selectedButton.current?.scrollIntoView({ block: "nearest" });
	}, [revealId, collapsed]);
	const visible = runs.slice(0, limit);
	if (selected && !visible.includes(selected)) visible.push(selected);
	return (
		<section aria-label={group === "sessions" ? "Sessions" : `${label} sessions`}>
			<GroupHeader
				group={group}
				label={label}
				count={runs.length}
				expanded={!collapsed}
				onToggle={() => uiActions.toggleGroup(routeKey, group)}
				phone={phone}
				controls={contentId}
				appearance="sidebar"
				sticky
			/>
			<div id={contentId} hidden={collapsed}>
				<ul className="flex flex-col gap-0.5 px-2 pb-2">
					{visible.map((run) => {
						const historical = isHistoricalSession(run);
						const state = sessionStateLabel(run);
						const needsAttention = ["failed", "interrupted", "needs-input", "done"].includes(sessionStatus(run));
						const session = sessionsByRunId.get(run.id);
						return (
							<li key={run.id} className="group/row relative">
								<button
									ref={run.id === selectedId ? selectedButton : undefined}
									type="button"
									title={`${run.ticketIdentifier ?? run.name}${run.ticketTitle ? ` · ${run.ticketTitle}` : ""} · ${state} · ${new Date(run.createdAt).toLocaleString()}`}
									aria-current={selectedId === run.id ? "page" : undefined}
									className="sidebar-item"
									onClick={() => onSelect(run.id)}
								>
									<span aria-hidden="true" className="flex shrink-0">
										<Avatar
											kind="agent"
											name={run.ticketIdentifier ?? run.name}
											agentKind={agentKindOf(run.kind)}
											agentProfile={agentProfileOf(run.harness)}
											state={isAgentWorking(run) ? "working" : "static"}
											status={sessionStatus(run)}
											className="size-5"
										/>
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2">
											<span className="min-w-0 flex-1 truncate font-medium tabular">
												{run.ticketIdentifier ?? run.name}
											</span>
											{needsAttention && <span className="shrink-0 text-xs font-normal text-fg-muted">{state}</span>}
										</span>
										<span className="flex items-center gap-2 text-xs text-fg-muted tabular">
											<span className="min-w-0 flex-1 truncate">
												{historical
													? dateFormat.format(new Date(run.createdAt))
													: (run.ticketTitle ?? dateFormat.format(new Date(run.createdAt)))}
											</span>
											{run.runtime === "native" && run.workspaceId !== null && (
												<RunLineChanges run={run} enabled={!collapsed} />
											)}
										</span>
									</span>
								</button>
								{session !== undefined && (
									<span
										data-slot="menu"
										className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
									>
										<SessionActionsMenu session={session} size="xs" />
									</span>
								)}
							</li>
						);
					})}
				</ul>
				{runs.length > visible.length && (
					<div className="flex items-center justify-center gap-2 pb-2">
						<span className="text-xs text-fg-muted tabular">
							{visible.length} of {runs.length}
						</span>
						<Tooltip content={`Load more ${label.toLowerCase()} sessions`}>
							<IconButton
								label={`Load more ${label.toLowerCase()} sessions`}
								icon={<ArrowDown />}
								onClick={() => setLimit(limit + 30)}
							/>
						</Tooltip>
					</div>
				)}
			</div>
		</section>
	);
}
