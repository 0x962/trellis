import { type AgentRun, type Session, sessionStatus } from "@trellis/api";
import { Avatar, GroupHeader, useMediaQuery } from "@trellis/ui";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { isAgentWorking } from "../../../../agents/isAgentWorking";
import { SessionActionsMenu } from "../../../SessionActionsMenu";
import { SessionName } from "../../../SessionName";
import { sessionStateLabel } from "../../../sessionStateLabel";
import { isHistoricalSession } from "../../isHistoricalSession";
import { nextSessionLimit, SESSION_REVEAL_STEP, visibleSessions } from "../../sessionGroups";
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
	projectKey,
	runs,
	scroller,
	sessionsByRunId,
	selectedId,
	onSelect,
	searching = false,
}: {
	group: string;
	label: string;
	projectKey: string;
	runs: AgentRun[];
	scroller: RefObject<HTMLDivElement | null>;
	sessionsByRunId: Map<string, Session>;
	selectedId?: string;
	onSelect: (id: string) => void;
	searching?: boolean;
}) {
	const contentId = useId();
	const routeKey = `/sessions/project/${projectKey}`;
	const collapsed = useUiStore((state) => state.collapsedGroups[routeKey]?.includes(group) ?? false);
	const phone = useMediaQuery("(max-width: 767px)");
	const [limit, setLimit] = useState(SESSION_REVEAL_STEP);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const selectedButton = useRef<HTMLButtonElement>(null);
	const selected = runs.find((run) => run.id === selectedId);
	const revealId = selected?.id;
	useEffect(() => {
		if (revealId || searching) uiActions.setGroupCollapsed(routeKey, group, false);
	}, [revealId, routeKey, group, searching]);
	useEffect(() => {
		if (revealId && !collapsed) selectedButton.current?.scrollIntoView({ block: "nearest" });
	}, [revealId, collapsed]);
	const visible = visibleSessions(runs, limit, selectedId);
	// A selected run that sits past the limit joins the drawn rows, so the
	// limit, and not the number of drawn rows, says whether rows remain.
	const more = runs.length > limit;
	// The end marker sits under the last drawn row. The browser reports it
	// when it comes within 240 px of the bottom of the scrolling box, and the
	// group then draws its next rows. A collapsed group draws no box, so the
	// browser reports nothing and the group reveals nothing. The marker
	// leaves the tree once every run is drawn, which ends the reveal.
	//
	// A new limit builds a new observer, which measures the marker again. A
	// tall box that still holds the marker after a reveal therefore draws the
	// rows after those as well, until the marker sits below the box.
	const endMarker = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const marker = endMarker.current;
		if (marker === null) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) setLimit(nextSessionLimit(limit, runs.length));
			},
			{ root: scroller.current, rootMargin: "0px 0px 240px 0px" },
		);
		observer.observe(marker);
		return () => observer.disconnect();
	}, [limit, runs.length, scroller]);
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
						const name = run.ticketIdentifier ?? session?.name ?? run.name;
						const renaming = session !== undefined && renamingId === session.id;
						const avatar = (
							<Avatar
								kind="agent"
								name={name}
								agentKind={agentKindOf(run.kind)}
								agentProfile={agentProfileOf(run.harness)}
								state={isAgentWorking(run) ? "working" : "static"}
								status={sessionStatus(run)}
								className="size-5"
							/>
						);
						const row = (
							<button
								ref={run.id === selectedId ? selectedButton : undefined}
								type="button"
								title={`${name}${run.ticketTitle ? ` · ${run.ticketTitle}` : ""} · ${state} · ${new Date(run.createdAt).toLocaleString()}`}
								aria-current={selectedId === run.id ? "page" : undefined}
								className="sidebar-item"
								onClick={() => onSelect(run.id)}
							>
								<span aria-hidden="true" className="flex shrink-0">
									{avatar}
								</span>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-2">
										<span className="min-w-0 flex-1 truncate font-medium tabular">{name}</span>
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
						);
						return (
							<li key={run.id} className="group/row relative">
								{session === undefined ? (
									row
								) : (
									<SessionName
										session={session}
										editing={renaming}
										onEditingChange={(open) => setRenamingId(open ? session.id : null)}
										fieldClassName="sidebar-item-box"
										inputClassName="h-7 text-sm"
										leading={
											<span aria-hidden="true" className="flex shrink-0">
												{avatar}
											</span>
										}
									>
										{row}
									</SessionName>
								)}
								{session !== undefined && !renaming && (
									<span
										data-slot="menu"
										className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
									>
										<SessionActionsMenu session={session} size="xs" onRename={() => setRenamingId(session.id)} />
									</span>
								)}
							</li>
						);
					})}
				</ul>
				{more && (
					<div ref={endMarker} role="status" className="px-4 pb-2 text-xs text-fg-muted tabular">
						{visible.length} of {runs.length}
					</div>
				)}
				{!more && runs.length > SESSION_REVEAL_STEP && (
					<p className="px-4 pb-2 text-xs text-fg-muted tabular">All {runs.length} shown</p>
				)}
			</div>
		</section>
	);
}
