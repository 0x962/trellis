import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { type BoardOutput, type BoardQueryInput, eventApplierFor, type Status, type StatusSummary } from "@trellis/api";
import { toast, useMediaQuery, useTheme } from "@trellis/ui";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { PeekListProvider } from "../../ticket/TicketPeek/providers/PeekListProvider";
import { categoryColumns, moveInBoard, projectColumns } from "../columns";
import { BoardColumn } from "../components/BoardColumn";
import { BoardSkeleton } from "../components/BoardSkeleton";
import { StatusChoice } from "../components/StatusChoice";
import { useBoardAutoScroll, useBoardMonitor } from "../hooks/useBoardDnd";
import type { BoardColumnModel, BoardMove } from "../types";
import { boardSort } from "./constants";
import { useDropMotion } from "./hooks/useDropMotion";
import { columnWidth } from "./utils/columnWidth";

export type BoardProps = {
	projectRef?: string;
	filters?: BoardQueryInput;
	storageKey: string;
	onOpenTicket: (identifier: string) => void;
	// Renders inside the board's peek list, so a peek there walks the cards
	// column by column.
	children?: ReactNode;
};

type PendingChoice = BoardMove & { statuses: Status[] };

const noCollapsedColumns: string[] = [];

// The closed categories start as rails at the end of the board, so the open
// columns get the width.
const closedCategories = ["done", "canceled"];

// The board has no card selection, so the palette's Selection section
// stays empty on it.
const noSelection: string[] = [];

export function Board({ projectRef, filters = {}, storageKey, onOpenTicket, children }: BoardProps) {
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
	const collapsed = useUiStore((state) => state.collapsedGroups[storageKey] ?? noCollapsedColumns);
	const well = useTheme().resolved === "light";
	const phone = useMediaQuery("(max-width: 767px)");
	// The card that last took the focus is the palette's This ticket.
	const [focusedCard, setFocusedCard] = useState<string | null>(null);
	useCommandContext(focusedCard, noSelection);

	const columns = useMemo(() => {
		if (boardQuery.data === undefined) return [];
		if (projectRef === undefined) return categoryColumns(boardQuery.data);
		if (projectQuery.data === undefined) return [];
		return projectColumns(boardQuery.data, projectQuery.data);
	}, [boardQuery.data, projectQuery.data, projectRef]);

	// The cards the peek walks with j and k. A card in a collapsed column
	// stays in the list but is not visible.
	const peekRows = useMemo(
		() =>
			columns.flatMap((column) =>
				column.items.map((ticket) => ({ identifier: ticket.identifier, visible: !collapsed.includes(column.id) })),
			),
		[columns, collapsed],
	);

	useEffect(() => {
		if (useUiStore.getState().collapsedGroups[storageKey] !== undefined) return;
		for (const column of columns) {
			if (closedCategories.includes(column.category)) uiActions.setGroupCollapsed(storageKey, column.id, true);
		}
	}, [columns, storageKey]);

	const runMove = useCallback(
		async (move: BoardMove, chosen?: Status) => {
			// A drop and a Shift+Arrow key both end here. The server refuses a
			// move of a ticket under an archived project, so none is sent.
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
			context.queryClient.setQueryData(
				boardOptions.queryKey,
				moveInBoard(snapshot, move.ticket, summary, move.after, move.before),
			);
			const destination = move.column.items.findIndex((ticket) => ticket.id === (move.after ?? move.before)?.id);
			announce(
				`Moved to ${move.column.name}, position ${destination < 0 ? 1 : destination + (move.after === undefined ? 1 : 2)} of ${move.column.items.length}`,
			);
			const applier = eventApplierFor(context.queryClient);
			applier.beginMutation(move.ticket.id);
			try {
				const result = await context.client.tickets.move({
					ticket: move.ticket.identifier,
					status: statusRef,
					...(move.after === undefined ? {} : { after: move.after.identifier }),
					...(move.before === undefined ? {} : { before: move.before.identifier }),
					expectedVersion: move.ticket.version,
				});
				applier.endMutation(move.ticket.id, result);
			} catch (error) {
				applier.endMutation(move.ticket.id);
				context.queryClient.setQueryData(boardOptions.queryKey, snapshot);
				const failed = `${move.ticket.identifier} did not move to ${move.column.name}.`;
				if (error instanceof ORPCError && error.code === "VERSION_CONFLICT") {
					const message = `${failed} Another actor changed the ticket first.`;
					announce(message);
					toast.error(message);
					return;
				}
				announce(failed);
				toast.error(failed, {
					description: error instanceof Error ? error.message : String(error),
					action: { label: "Retry", onClick: () => void runMove(move, chosen) },
				});
			}
		},
		[announce, boardOptions.queryKey, context.client.tickets, context.queryClient, isArchived, notice],
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
	const onDropped = useDropMotion(columns);
	useBoardMonitor(columns, (move) => void runMove(move), chooseOrMove, announce, onDropped);

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
		if (cursor === undefined) cursor = (await context.client.tickets.list(input)).nextCursor;
		if (cursor === null) return;
		const page = await context.client.tickets.list({ ...input, cursor });
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
		if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
			event.preventDefault();
			const target = column.items[index + (event.key === "ArrowUp" ? -1 : 1)];
			if (target !== undefined) {
				void runMove({ ticket, column, ...(event.key === "ArrowUp" ? { before: target } : { after: target }) });
			}
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
		<PeekListProvider rows={peekRows}>
			<div ref={boardRef} data-board="" className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto p-4">
				{columns.map((column) => (
					<BoardColumn
						key={column.id}
						column={column}
						collapsed={collapsed.includes(column.id)}
						showAllDone={showAllDone}
						categoryMode={projectRef === undefined}
						width={width}
						well={well}
						onToggle={() => uiActions.setGroupCollapsed(storageKey, column.id, !collapsed.includes(column.id))}
						onShowAllDone={() => setShowAllDone(true)}
						onNewTicket={() => openComposer(column)}
						onShowMore={() => showMore(column)}
						onOpenTicket={onOpenTicket}
						onFocusTicket={setFocusedCard}
						onCardKeyDown={keyDown}
						onAnnounce={announce}
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
					onCancel={() => setPendingChoice(null)}
				/>
			)}
			{children}
		</PeekListProvider>
	);
}
