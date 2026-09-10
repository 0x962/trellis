import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import {
	type BoardOutput,
	type BoardQueryInput,
	eventApplierFor,
	type Status,
	type Ticket,
	type TicketSummary,
} from "@trellis/api";
import { Skeleton, toast } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useApp } from "../../../lib/appContext";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { categoryColumns, moveInBoard, projectColumns } from "../columns";
import { BoardColumn } from "../components/BoardColumn";
import { StatusChoice } from "../components/StatusChoice";
import { useBoardAutoScroll, useBoardMonitor } from "../hooks/useBoardDnd";
import type { BoardColumnModel, BoardMove } from "../types";

export type BoardProps = {
	projectRef?: string;
	filters?: BoardQueryInput;
	storageKey: string;
	onOpenTicket: (identifier: string) => void;
};

type PendingChoice = BoardMove & { statuses: Status[] };

const noCollapsedColumns: string[] = [];

const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, children, prs, attachments, descriptionStale, ...summary } = ticket;
	return summary;
};

export function Board({ projectRef, filters = {}, storageKey, onOpenTicket }: BoardProps) {
	const context = useApp();
	const boardRef = useRef<HTMLDivElement>(null);
	const [announcement, setAnnouncement] = useState("");
	const [showAllDone, setShowAllDone] = useState(false);
	const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
	const [cursors, setCursors] = useState<Record<string, string | null>>({});
	const announce = useCallback((message: string) => flushSync(() => setAnnouncement(message)), []);
	const boardOptions = context.orpc.tickets.board.queryOptions({ input: { ...filters, project: projectRef } });
	const projectOptions = context.orpc.projects.get.queryOptions({ input: { project: projectRef ?? "CDE" } });
	const boardQuery = useQuery(boardOptions);
	const projectQuery = useQuery({ ...projectOptions, enabled: projectRef !== undefined });
	const collapsed = useUiStore((state) => state.collapsedGroups[storageKey] ?? noCollapsedColumns);

	const columns = useMemo(() => {
		if (boardQuery.data === undefined) return [];
		if (projectRef === undefined) return categoryColumns(boardQuery.data);
		if (projectQuery.data === undefined) return [];
		return projectColumns(boardQuery.data, projectQuery.data);
	}, [boardQuery.data, projectQuery.data, projectRef]);

	useEffect(() => {
		const canceled = columns.find((column) => column.category === "canceled");
		if (canceled !== undefined && useUiStore.getState().collapsedGroups[storageKey] === undefined) {
			uiActions.setGroupCollapsed(storageKey, canceled.id, true);
		}
	}, [columns, storageKey]);

	const runMove = useCallback(
		async (move: BoardMove, chosen?: Status) => {
			const status = chosen ?? move.column.statuses[0]!;
			const snapshot = context.queryClient.getQueryData<BoardOutput>(boardOptions.queryKey)!;
			context.queryClient.setQueryData(
				boardOptions.queryKey,
				moveInBoard(snapshot, move.ticket, status, move.after, move.before),
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
					status: status.slug,
					...(move.after === undefined ? {} : { after: move.after.identifier }),
					...(move.before === undefined ? {} : { before: move.before.identifier }),
					expectedVersion: move.ticket.version,
				});
				applier.endMutation(move.ticket.id, result);
			} catch (error) {
				applier.endMutation(move.ticket.id);
				context.queryClient.setQueryData(boardOptions.queryKey, snapshot);
				const message =
					error instanceof ORPCError && error.code === "VERSION_CONFLICT"
						? "The ticket changed. The board restored its prior position."
						: "The move failed. The board restored its prior position.";
				announce(message);
				toast.error(message);
			}
		},
		[announce, boardOptions.queryKey, context.client.tickets, context.queryClient],
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

	useBoardAutoScroll(boardRef);
	useBoardMonitor(columns, (move) => void runMove(move), chooseOrMove, announce);

	const createTicket = async (column: BoardColumnModel, title: string) => {
		const status = column.statuses[0]!;
		const project = projectRef ?? column.items[0]!.project.path;
		const result = await context.client.tickets.create({ project, status: status.slug, title });
		const current = context.queryClient.getQueryData<BoardOutput>(boardOptions.queryKey)!;
		context.queryClient.setQueryData(boardOptions.queryKey, moveInBoard(current, summaryOf(result), status));
	};

	const showMore = async (column: BoardColumnModel) => {
		const input = {
			...filters,
			project: projectRef,
			status: column.statuses.map((status) => status.slug),
			sort: "position" as const,
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
			document.querySelector<HTMLElement>(`[data-ticket-id="${target?.id}"]`)?.focus();
		}
	};

	if (boardQuery.data === undefined || (projectRef !== undefined && projectQuery.data === undefined)) {
		return <Skeleton className="m-4 h-24 w-75" />;
	}

	return (
		<>
			<div ref={boardRef} data-board="" className="flex min-h-0 flex-1 snap-x gap-2 overflow-auto bg-bg p-4">
				{columns.map((column) => (
					<BoardColumn
						key={column.id}
						column={column}
						collapsed={collapsed.includes(column.id)}
						showAllDone={showAllDone}
						categoryMode={projectRef === undefined}
						onToggle={() => uiActions.setGroupCollapsed(storageKey, column.id, !collapsed.includes(column.id))}
						onShowAllDone={() => setShowAllDone(true)}
						onCreate={(title) => createTicket(column, title)}
						onShowMore={() => showMore(column)}
						onOpenTicket={onOpenTicket}
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
						void runMove(pendingChoice, status);
						setPendingChoice(null);
					}}
					onCancel={() => setPendingChoice(null)}
				/>
			)}
		</>
	);
}
