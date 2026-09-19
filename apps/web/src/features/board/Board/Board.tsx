import { useQuery } from "@tanstack/react-query";
import {
	type BoardOutput,
	type BoardQueryInput,
	eventApplierFor,
	type Status,
	type StatusSummary,
	type TicketSummary,
} from "@trellis/api";
import { toast, useMediaQuery, useTheme } from "@trellis/ui";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { conflictCurrent, conflictMessage, errorMessage } from "../../../lib/conflict";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useWorkingAgents } from "../../agents/useWorkingAgents";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { BoardLineStatsContext } from "../BoardLineStatsContext";
import { categoryColumns, moveInBoard, projectColumns, workingFirst, workingGroupInsertIndex } from "../columns";
import { BoardBulkBar } from "../components/BoardBulkBar";
import { BoardColumn } from "../components/BoardColumn";
import { BoardLabels } from "../components/BoardLabels";
import { BoardSkeleton } from "../components/BoardSkeleton";
import { StatusChoice } from "../components/StatusChoice";
import { useBoardBulk } from "../hooks/useBoardBulk";
import { useBoardAutoScroll, useBoardMonitor } from "../hooks/useBoardDnd";
import { useBoardSelection } from "../hooks/useBoardSelection";
import { useVisibleCards } from "../hooks/useVisibleCards";
import type { BoardColumnModel, BoardMove } from "../types";
import { useBoardLineStats } from "./hooks/useBoardLineStats";
import { useCardPositionMotion } from "./hooks/useCardPositionMotion";
import { useShowMore } from "./hooks/useShowMore";
import { cardKeyDown } from "./utils/cardKeyDown";
import { columnWidth } from "./utils/columnWidth";

export type BoardProps = {
	projectRef?: string;
	filters?: BoardQueryInput;
	storageKey: string;
	// The concurrency slots of the project. The first started column shows
	// them, because its tickets are the ones agents work on.
	onOpenTicket: (identifier: string) => void;
};

type PendingChoice = BoardMove & { statuses: Status[] };

const noCollapsedColumns: string[] = [];

// The closed categories start as rails at the end of the board, so the open
// columns get the width.
const closedCategories = ["done", "canceled"];

export function Board({ projectRef, filters = {}, storageKey, onOpenTicket }: BoardProps) {
	const context = useApp();
	const boardRef = useRef<HTMLDivElement>(null);
	const [announcement, setAnnouncement] = useState("");
	const [showAllDone, setShowAllDone] = useState(false);
	const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
	// The id of the card whose label picker is open, from the `l` key.
	const [labelTicketId, setLabelTicketId] = useState<string | null>(null);
	const announce = useCallback((message: string) => flushSync(() => setAnnouncement(message)), []);
	const { isArchived, notice } = useArchivedProjects();
	const boardOptions = context.orpc.tickets.board.queryOptions({ input: { ...filters, project: projectRef } });
	const projectOptions = context.orpc.projects.get.queryOptions({ input: { project: projectRef ?? "CDE" } });
	const boardQuery = useQuery(boardOptions);
	const projectQuery = useQuery({ ...projectOptions, enabled: projectRef !== undefined });
	const { ticketIds: workingTicketIds } = useWorkingAgents();
	const workingTickets = useMemo(() => new Set(workingTicketIds), [workingTicketIds]);
	const collapsed = useUiStore((state) => state.collapsedGroups[storageKey] ?? noCollapsedColumns);
	const well = useTheme().resolved === "light";
	const phone = useMediaQuery("(max-width: 767px)");
	// The card that last took the focus is the palette's This ticket.
	const [focusedCard, setFocusedCard] = useState<string | null>(null);

	const sourceColumns = useMemo(() => {
		if (boardQuery.data === undefined) return [];
		if (projectRef === undefined) return categoryColumns(boardQuery.data);
		if (projectQuery.data === undefined) return [];
		return projectColumns(boardQuery.data, projectQuery.data);
	}, [boardQuery.data, projectQuery.data, projectRef]);
	const columns = useMemo(() => workingFirst(sourceColumns, workingTickets), [sourceColumns, workingTickets]);
	const startedTicketIds = useMemo(
		() =>
			columns
				.filter((column) => column.category === "started")
				.flatMap((column) => column.items.map((ticket) => ticket.id)),
		[columns],
	);
	const lineStats = useBoardLineStats(startedTicketIds);
	const cardsOf = useVisibleCards({ columns, collapsedColumnIds: collapsed, showAllDone });
	const selection = useBoardSelection({ columns, cardsOf, focusedCard, say: setAnnouncement });
	const bulk = useBoardBulk({ rows: selection.rows, project: projectRef, onDeleted: selection.clear });
	useCommandContext(focusedCard, selection.rows, selection.owner);

	useEffect(() => {
		if (useUiStore.getState().collapsedGroups[storageKey] !== undefined) return;
		for (const column of columns) {
			if (closedCategories.includes(column.category)) uiActions.setGroupCollapsed(storageKey, column.id, true);
		}
	}, [columns, storageKey]);

	const runMove = useCallback(
		async (move: BoardMove, chosen?: Status) => {
			// A drop, a bracket key, and the status picker all end here. The
			// server refuses a move of a ticket under an archived project, so
			// none is sent.
			if (isArchived(move.ticket.project.path)) {
				const message = notice(move.ticket.project.path);
				announce(message);
				toast.error(message);
				return;
			}
			const status = chosen ?? move.column.statuses[0];
			const statusRef = status?.slug ?? `category:${move.column.category}`;
			const summary: StatusSummary = status ?? {
				...move.ticket.status,
				name: move.column.name,
				slug: statusRef,
				category: move.column.category,
			};
			const snapshot = context.queryClient.getQueryData<BoardOutput>(boardOptions.queryKey)!;
			context.queryClient.setQueryData(boardOptions.queryKey, moveInBoard(snapshot, move.ticket, summary));
			const targetItems = move.column.items.filter((ticket) => ticket.id !== move.ticket.id);
			const position = workingGroupInsertIndex(targetItems, move.ticket.id, workingTickets);
			announce(`Moved to ${move.column.name}, position ${position + 1} of ${targetItems.length + 1}`);
			const applier = eventApplierFor(context.queryClient);
			applier.beginMutation(move.ticket.id);
			try {
				const result = await context.client.tickets.move({
					ticket: move.ticket.identifier,
					status: statusRef,
					expectedVersion: move.ticket.version,
				});
				applier.endMutation(move.ticket.id, result);
			} catch (error) {
				// The board snapshot goes back before the applier writes. The
				// other order puts the snapshot over the row the server holds,
				// and the card keeps the version this page sent.
				context.queryClient.setQueryData(boardOptions.queryKey, snapshot);
				const conflict = conflictCurrent(error);
				applier.endMutation(move.ticket.id, conflict ?? undefined);
				// The card now holds the other actor's version. A retry would
				// write over that version before the person reads it, so the
				// toast offers none.
				if (conflict !== null) {
					const message = conflictMessage(move.ticket.identifier);
					announce(message);
					toast.error(message);
					return;
				}
				const failed = `${move.ticket.identifier} did not move to ${move.column.name}.`;
				announce(failed);
				toast.error(failed, {
					description: errorMessage(error),
					action: { label: "Retry", onClick: () => void runMove(move, chosen) },
				});
			}
		},
		[announce, boardOptions.queryKey, context.client.tickets, context.queryClient, isArchived, notice, workingTickets],
	);

	const chooseOrMove = useCallback(
		(move: BoardMove) => {
			const ownStatuses = move.column.statuses.filter((status) => status.projectId === move.ticket.project.id);
			const statuses = ownStatuses.length > 0 ? ownStatuses : move.column.statuses;
			if (statuses.length > 1) setPendingChoice({ ...move, statuses });
			else void runMove(move, statuses[0]);
		},
		[runMove],
	);

	const ready = boardQuery.data !== undefined && (projectRef === undefined || projectQuery.data !== undefined);
	useBoardAutoScroll(boardRef, ready);
	const { recordDropOrigin, clearDropOrigin } = useCardPositionMotion(
		boardRef,
		columns,
		`${collapsed.join(",")}:${showAllDone}`,
		ready,
	);
	// A drag carries the one card the person picked up. That card then leaves
	// the rest of the selection behind, so the board drops the selection.
	const dropSelection = (ticketId: string) => {
		if (selection.isSelected(ticketId)) selection.clear();
	};
	useBoardMonitor(columns, (move) => void runMove(move), chooseOrMove, announce, recordDropOrigin, dropSelection);

	const showMore = useShowMore({ filters, project: projectRef, boardKey: boardOptions.queryKey });

	const keyDown = cardKeyDown({
		columns,
		cardsOf,
		openTicket: onOpenTicket,
		chooseStatus: (move) => setPendingChoice({ ...move, statuses: columns.flatMap((entry) => entry.statuses) }),
		moveTo: chooseOrMove,
		setLabels: setLabelTicketId,
		selection,
		openBulk: bulk.openPicker,
		copySelection: bulk.copyIds,
		deleteSelection: bulk.remove,
	});

	const cardClick = (event: MouseEvent<HTMLElement>, column: BoardColumnModel, ticket: TicketSummary) => {
		if (!selection.click(column.id, ticket.id, event)) onOpenTicket(ticket.identifier);
	};

	if (!ready) return <BoardSkeleton />;

	const labelTicket = columns.flatMap((column) => column.items).find((item) => item.id === labelTicketId);

	// On a phone each open column is 85% of the window, and the strip snaps.
	const width = phone
		? "85vw"
		: columnWidth(columns.length, columns.filter((column) => collapsed.includes(column.id)).length);

	return (
		<BoardLineStatsContext.Provider value={lineStats}>
			<div className="relative flex min-h-0 flex-1 flex-col">
				<div ref={boardRef} data-board="" className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-5 py-4">
					{columns.map((column) => (
						<BoardColumn
							key={column.id}
							column={column}
							collapsed={collapsed.includes(column.id)}
							showAllDone={showAllDone}
							categoryMode={projectRef === undefined}
							width={width}
							well={well}
							workingTicketIds={workingTickets}
							bottomRoom={selection.count > 0}
							isSelected={selection.isSelected}
							onToggle={() => uiActions.setGroupCollapsed(storageKey, column.id, !collapsed.includes(column.id))}
							onShowAllDone={() => setShowAllDone(true)}
							onShowMore={() => showMore(column)}
							onFocusTicket={setFocusedCard}
							onCardClick={cardClick}
							onCardKeyDown={keyDown}
							onAnnounce={announce}
						/>
					))}
				</div>
				<BoardBulkBar rows={selection.rows} project={projectRef} bulk={bulk} onClear={selection.clear} />
			</div>
			<div role="status" aria-label="Board drag status" aria-live="assertive" className="sr-only">
				{announcement}
			</div>
			{labelTicket !== undefined && <BoardLabels ticket={labelTicket} onClose={() => setLabelTicketId(null)} />}
			{pendingChoice !== null && (
				<StatusChoice
					statuses={pendingChoice.statuses}
					onChoose={(status) => {
						const target = columns.find((column) => column.statuses.some((candidate) => candidate.id === status.id));
						void runMove({ ...pendingChoice, column: target ?? pendingChoice.column }, status);
						setPendingChoice(null);
					}}
					onCancel={() => {
						clearDropOrigin();
						setPendingChoice(null);
					}}
				/>
			)}
		</BoardLineStatsContext.Provider>
	);
}
