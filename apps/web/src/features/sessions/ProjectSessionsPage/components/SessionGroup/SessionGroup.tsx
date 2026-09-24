import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { type AgentRun, type Session, sessionStatus } from "@trellis/api";
import { Avatar, GroupHeader, groupHeaderHeight, PinMark, phoneGroupHeaderHeight, useMediaQuery } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { isAgentWorking } from "../../../../agents/isAgentWorking";
import { SessionActionsMenu } from "../../../SessionActionsMenu";
import { SessionName } from "../../../SessionName";
import { sessionStateLabel } from "../../../sessionStateLabel";
import { isHistoricalSession } from "../../isHistoricalSession";
import { keptSessionRows, nextSessionRow, SESSION_ROW_HEIGHT, sessionRowRange } from "../../sessionGroups";
import { RunLineChanges } from "./components/RunLineChanges";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

// The row of the list that holds an event, or null when the event comes
// from outside the rows. The menu of a row draws its items in a portal at
// the end of the document, and React sends the events of that portal to
// the handlers of the list, so a target with no row above it is a normal
// event of an open menu and not a row of the list.
const rowOf = (target: EventTarget) => (target as HTMLElement).closest<HTMLLIElement>("li[data-run]");
const controlsOf = (item: Element) => [...item.querySelectorAll("button")];

// One group of the session list. The rows of every group scroll in one box,
// which `SessionList` owns and passes as `scroller`. The group draws only
// the rows that box shows, so a history of a thousand runs costs the same
// as a history of thirty. Each drawn row of a native run asks the server
// for the Git state of its workspace, and the server runs Git for each of
// those reads, so the number of drawn rows is the cost of the list.
//
// `scrollMargin` is the distance from the top of the scrolled content to
// the first row of this group. The virtualizer needs it, because two groups
// share one box and the second group starts below the rows of the first.
// `layout` counts the changes of the content height, and every change moves
// the groups, so the group measures that distance again on each count.
export function SessionGroup({
	group,
	label,
	projectKey,
	runs,
	scroller,
	layout,
	sessionsByRunId,
	selectedId,
	onSelect,
	searching = false,
}: {
	group: string;
	label: string;
	projectKey: string;
	runs: AgentRun[];
	scroller: HTMLDivElement | null;
	layout: number;
	sessionsByRunId: Map<string, Session>;
	selectedId?: string;
	onSelect: (id: string) => void;
	searching?: boolean;
}) {
	const contentId = useId();
	const routeKey = `/sessions/project/${projectKey}`;
	const collapsed = useUiStore((state) => state.collapsedGroups[routeKey]?.includes(group) ?? false);
	const phone = useMediaQuery("(max-width: 767px)");
	const [renamingId, setRenamingId] = useState<string | null>(null);
	// The run whose row last took the keyboard focus, and the run the Tab
	// key asks for while its row is outside the tree. Both hold the ID of
	// the run and not its place, because a poll every two seconds can move a
	// run in the list or drop it from the list.
	//
	// The list holds that row until another row takes the focus. The focus
	// leaves a row for the items of its own menu, which stand outside the
	// list, and the row must stay in the tree while its menu is open,
	// because the menu hangs from a control of that row.
	const [focusedId, setFocusedId] = useState<string>();
	const [scrollMargin, setScrollMargin] = useState(0);
	const rowBox = useRef<HTMLUListElement>(null);
	const selectedButton = useRef<HTMLButtonElement>(null);
	const wantsFocus = useRef<{ id: string; back: boolean } | null>(null);
	const [selectedIndex, focusedIndex] = keptSessionRows(runs, [selectedId, focusedId]);
	const revealId = selectedIndex === -1 ? undefined : selectedId;
	useEffect(() => {
		if (revealId || searching) uiActions.setGroupCollapsed(routeKey, group, false);
	}, [revealId, routeKey, group, searching]);
	useEffect(() => {
		if (revealId && !collapsed) selectedButton.current?.scrollIntoView({ block: "nearest" });
	}, [revealId, collapsed]);
	// React attaches the parent scroller after this child's layout effects.
	// SessionList passes that element through state to measure again once it exists.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `layout` counts the changes of the content height, which is the trigger to measure again
	useLayoutEffect(() => {
		if (collapsed || scroller === null) return;
		const view = scroller;
		const top = rowBox.current!.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
		setScrollMargin(top);
	}, [collapsed, layout, scroller]);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			sessionRowRange(defaultRangeExtractor(range), [selectedIndex!, focusedIndex!]),
		[selectedIndex, focusedIndex],
	);
	const virtualizer = useVirtualizer({
		count: runs.length,
		getScrollElement: () => scroller,
		estimateSize: () => SESSION_ROW_HEIGHT,
		scrollMargin,
		overscan: 8,
		rangeExtractor,
		// A row that a key scrolls to lands under the header of its group,
		// which stands at the top of the box while its rows pass.
		scrollPaddingStart: phone ? phoneGroupHeaderHeight : groupHeaderHeight,
		getItemKey: (index) => runs[index]!.id,
	});
	const drawn = virtualizer.getVirtualItems();
	// The request of the Tab key, once the row it names is in the tree. The
	// Tab key walks forward to the first control of a row and back to the
	// last control of a row, which is the menu of a session. A request for a
	// run the list no longer holds ends here. A run the list still holds but
	// does not draw gets one more scroll, because the list can move a run
	// between the key and this render.
	useEffect(() => {
		const request = wantsFocus.current;
		if (request === null) return;
		const index = runs.findIndex((run) => run.id === request.id);
		if (index === -1) {
			wantsFocus.current = null;
			return;
		}
		const item = rowBox.current!.querySelector(`li[data-run="${request.id}"]`);
		if (item === null) {
			virtualizer.scrollToIndex(index, { align: "auto" });
			return;
		}
		const controls = controlsOf(item);
		(request.back ? controls[controls.length - 1]! : controls[0]!).focus({ preventScroll: true });
		wantsFocus.current = null;
	});
	// The Tab key walks the rows of the list. The row after the last drawn
	// row is outside the tree, so the browser would send the focus past the
	// list. The group scrolls that row into view instead and holds the
	// request until the row renders.
	const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
		if (event.key !== "Tab") return;
		const item = rowOf(event.target);
		if (item === null) return;
		const controls = controlsOf(item);
		if (event.target !== (event.shiftKey ? controls[0] : controls[controls.length - 1])) return;
		const next = nextSessionRow({
			focused: runs.findIndex((run) => run.id === item.dataset.run),
			total: runs.length,
			back: event.shiftKey,
			drawn: drawn.map((row) => row.index),
		});
		if (next === null) return;
		event.preventDefault();
		// The request stands before the scroll, because the scroll can draw
		// the row and run the effect above in the same turn.
		wantsFocus.current = { id: runs[next]!.id, back: event.shiftKey };
		virtualizer.scrollToIndex(next, { align: "auto" });
	};
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
				<ul
					ref={rowBox}
					className="relative mb-2"
					style={{ height: `${virtualizer.getTotalSize()}px` }}
					onKeyDown={onKeyDown}
					onFocus={(event) => {
						const item = rowOf(event.target);
						if (item !== null) setFocusedId(item.dataset.run);
					}}
				>
					{drawn.map((virtual) => {
						const run = runs[virtual.index]!;
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
										{run.pinnedAt !== null && <PinMark tooltip={false} focusable={false} />}
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
							<li
								key={virtual.key}
								data-run={run.id}
								className="group/row absolute right-2 left-2"
								style={{ top: `${virtual.start - scrollMargin}px`, height: `${SESSION_ROW_HEIGHT}px` }}
							>
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
								{!renaming && (
									<span
										data-slot="menu"
										className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
									>
										<SessionActionsMenu
											session={session}
											run={session === undefined ? run : undefined}
											size="xs"
											onRename={session === undefined ? undefined : () => setRenamingId(session.id)}
										/>
									</span>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</section>
	);
}
