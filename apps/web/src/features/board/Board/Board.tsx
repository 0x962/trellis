import { useQuery } from "@tanstack/react-query";
import {
	type BoardOutput,
	type BoardQueryInput,
	eventApplierFor,
	type ListOutput,
	type Status,
	type StatusSummary,
} from "@trellis/api";
import { toast, useMediaQuery, useTheme } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { conflictCurrent, conflictMessage, errorMessage } from "../../../lib/conflict";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useWorkingAgents } from "../../agents/useWorkingAgents";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { BoardLineStatsContext } from "../BoardLineStatsContext";
import { categoryColumns, moveInBoard, projectColumns, workingFirst, workingGroupInsertIndex } from "../columns";
import { BoardColumn } from "../components/BoardColumn";
import { BoardSkeleton } from "../components/BoardSkeleton";
import { StatusChoice } from "../components/StatusChoice";
import { useBoardAutoScroll, useBoardMonitor } from "../hooks/useBoardDnd";
import type { BoardColumnModel, BoardMove } from "../types";
import { boardSort } from "./constants";
import { useBoardLineStats } from "./hooks/useBoardLineStats";
import { useCardPositionMotion } from "./hooks/useCardPositionMotion";
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

// The board has no card selection, so the palette's Selection section
// stays empty on it.
const noSelection: string[] = [];

export function Board({ projectRef, filters = {}, storageKey, onOpenTicket }: BoardProps) {
	const context = useApp();
	const boardRef = useRef<HTMLDivElement>(null);
	const [announcement, setAnnouncement] = useState("");
	const [showAllDone, setShowAllDone] = useState(false);
	const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
	const [cursors, setCursors] = useState<Record<string, string | null>>({});
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
	useCommandContext(focusedCard, noSelection);

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
	useBoardMonitor(columns, (move) => void runMove(move), chooseOrMove, announce, recordDropOrigin);

	const setWipLimit = useCallback(
		async (statusId: string, limit: number | null) => {
			if (projectRef === undefined) return;
			try {
				await context.client.statuses.update({ project: projectRef, status: statusId, wipLimit: limit });
				await context.queryClient.invalidateQueries({ queryKey: boardOptions.queryKey });
				await context.queryClient.invalidateQueries({ queryKey: projectOptions.queryKey });
			} catch (error) {
				const message = errorMessage(error);
				announce(message);
				toast.error(message);
				throw error;
			}
		},
		[
			announce,
			boardOptions.queryKey,
			context.client.statuses,
			context.queryClient,
			projectOptions.queryKey,
			projectRef,
		],
	);

	const openComposer = (column: BoardColumnModel) => {
		const status = column.statuses[0];
		composerActions.open(
			projectRef === undefined || status === undefined ? {} : { project: projectRef, status: status.slug },
		);
	};

	const showMore = async (column: BoardColumnModel) => {
		const input = {
			...filters,
			project: projectRef,
			...(projectRef === undefined
				? { category: [column.category] }
				: { status: column.statuses.map((status) => status.slug) }),
			sort: boardSort,
			limit: 100,
		};
		let cursor = cursors[column.id];
		let page: ListOutput;
		try {
			if (cursor === undefined) cursor = (await context.client.tickets.list(input)).nextCursor;
			if (cursor === null) return;
			page = await context.client.tickets.list({ ...input, cursor });
		} catch (error) {
			toast.error("The column did not load more tickets.", {
				description: error instanceof Error ? error.message : String(error),
				action: { label: "Retry", onClick: () => void showMore(column) },
			});
			return;
		}
		setCursors((current) => ({ ...current, [column.id]: page.nextCursor }));
		context.queryClient.setQueryData<BoardOutput>(boardOptions.queryKey, (current) => ({
			columns: current!.columns.map((entry) => ({
				...entry,
				items: [
					...entry.items,
					...page.items.filter(
						(ticket) => ticket.status.id === entry.statusId && !entry.items.some((item) => item.id === ticket.id),
					),
				],
			})),
		}));
	};

	const keyDown = (event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, index: number) => {
		const ticket = column.items[index]!;
		if (event.key === "Enter") onOpenTicket(ticket.identifier);
		if (event.key === "s") {
			event.preventDefault();
			setPendingChoice({ ticket, column, statuses: columns.flatMap((entry) => entry.statuses) });
			return;
		}
		if (event.key === "[" || event.key === "]") {
			event.preventDefault();
			const at = columns.indexOf(column) + (event.key === "[" ? -1 : 1);
			const target = columns[at];
			if (target !== undefined) chooseOrMove({ ticket, column: target });
			return;
		}
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
			event.preventDefault();
			const columnIndex = columns.indexOf(column);
			const targetColumn = columns[columnIndex + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)];
			const targetIndex = index + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
			const target = targetColumn?.items[Math.max(0, Math.min(targetIndex, targetColumn.items.length - 1))];
			const element = document.querySelector<HTMLElement>(`[data-ticket-id="${target?.id}"]`);
			// The focus must not scroll the board, or the column headers leave
			// their row. The card then scrolls only its own list.
			element?.focus({ preventScroll: true });
			element?.scrollIntoView({ block: "nearest" });
		}
	};

	if (!ready) return <BoardSkeleton />;

	// On a phone each open column is 85% of the window, and the strip snaps.
	const width = phone
		? "85vw"
		: columnWidth(columns.length, columns.filter((column) => collapsed.includes(column.id)).length);

	return (
		<BoardLineStatsContext.Provider value={lineStats}>
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
						onToggle={() => uiActions.setGroupCollapsed(storageKey, column.id, !collapsed.includes(column.id))}
						onShowAllDone={() => setShowAllDone(true)}
						onNewTicket={() => openComposer(column)}
						onShowMore={() => showMore(column)}
						onOpenTicket={onOpenTicket}
						onFocusTicket={setFocusedCard}
						onCardKeyDown={keyDown}
						onAnnounce={announce}
						onSetWipLimit={setWipLimit}
					/>
				))}
			</div>
			<div role="status" aria-label="Board drag status" aria-live="assertive" className="sr-only">
				{announcement}
			</div>
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
