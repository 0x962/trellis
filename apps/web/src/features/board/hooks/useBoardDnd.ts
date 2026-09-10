import {
	draggable,
	dropTargetForElements,
	monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { type RefObject, useEffect, useState } from "react";
import type { BoardColumnModel, BoardMove } from "../types";

type TicketData = {
	type: "ticket";
	ticketId: string;
	statusId: string;
	identifier: string;
	title: string;
	index: number;
	columnName: string;
	columnCount: number;
};

const isTicketData = (data: Record<string | symbol, unknown>): data is TicketData => data.type === "ticket";

export const useBoardAutoScroll = (ref: RefObject<HTMLElement | null>) => {
	useEffect(() => {
		if (navigator.userAgent.includes("HappyDOM")) return;
		const element = ref.current!;
		return autoScrollForElements({ element, getAllowedAxis: () => "all" });
	}, [ref]);
};

export const useCardDnd = (
	ref: RefObject<HTMLElement | null>,
	input: Omit<TicketData, "type">,
	announce: (message: string) => void,
) => {
	const [closestEdge, setClosestEdge] = useState<"top" | "bottom" | null>(null);
	const { ticketId, statusId, identifier, title, index, columnName, columnCount } = input;
	useEffect(() => {
		const element = ref.current!;
		return combineCleanups(
			draggable({
				element,
				getInitialData: () => ({
					type: "ticket",
					ticketId,
					statusId,
					identifier,
					title,
					index,
					columnName,
					columnCount,
				}),
				onGenerateDragPreview: ({ nativeSetDragImage }) => {
					setCustomNativeDragPreview({
						nativeSetDragImage,
						render: ({ container }) => {
							container.className =
								"max-w-75 rounded-md border border-border bg-elevated px-3 py-2 text-base text-fg opacity-90 shadow-md";
							container.textContent = `${identifier} ${title}`;
						},
					});
				},
				onDragStart: () =>
					announce(`${identifier} picked up from ${columnName}, position ${index + 1} of ${columnCount}`),
			}),
			dropTargetForElements({
				element,
				canDrop: ({ source }) => isTicketData(source.data),
				getData: ({ input: pointer }) =>
					attachClosestEdge(
						{ type: "card", ticketId, statusId },
						{ element, input: pointer, allowedEdges: ["top", "bottom"] },
					),
				onDrag: ({ self }) => {
					const edge = extractClosestEdge(self.data);
					setClosestEdge(edge === "top" || edge === "bottom" ? edge : null);
				},
				onDragLeave: () => setClosestEdge(null),
				onDrop: () => setClosestEdge(null),
			}),
		);
	}, [announce, columnCount, columnName, identifier, index, ref, statusId, ticketId, title]);
	return closestEdge;
};

export const useColumnDnd = (
	ref: RefObject<HTMLElement | null>,
	column: BoardColumnModel,
	collapsed: boolean,
	expand: () => void,
) => {
	const [over, setOver] = useState(false);
	useEffect(() => {
		const element = ref.current!;
		let timer: ReturnType<typeof setTimeout> | undefined;
		return dropTargetForElements({
			element,
			canDrop: ({ source }) => isTicketData(source.data),
			getData: () => ({ type: "column", columnId: column.id }),
			onDragEnter: () => {
				setOver(true);
				if (collapsed) timer = setTimeout(expand, 400);
			},
			onDragLeave: () => {
				setOver(false);
				if (timer !== undefined) clearTimeout(timer);
			},
			onDrop: () => {
				setOver(false);
				if (timer !== undefined) clearTimeout(timer);
			},
		});
	}, [collapsed, column.id, expand, ref]);
	return over;
};

export const useBoardMonitor = (
	columns: BoardColumnModel[],
	onMove: (move: BoardMove) => void,
	onChooseStatus: (move: BoardMove) => void,
	announce: (message: string) => void,
) => {
	useEffect(
		() =>
			monitorForElements({
				canMonitor: ({ source }) => isTicketData(source.data),
				onDragStart: ({ source }) => {
					const data = source.data as TicketData;
					announce(
						`${data.identifier} picked up from ${data.columnName}, position ${data.index + 1} of ${data.columnCount}`,
					);
				},
				onDrop: ({ source, location }) => {
					const data = source.data as TicketData;
					const ticket = columns.flatMap((column) => column.items).find((item) => item.id === data.ticketId)!;
					const target = location.current.dropTargets[0];
					if (target === undefined) {
						announce("Drop canceled");
						return;
					}
					const columnId = target.data.type === "card" ? target.data.statusId : target.data.columnId;
					const column = columns.find(
						(entry) => entry.id === columnId || entry.statuses.some((status) => status.id === columnId),
					)!;
					const anchor =
						target.data.type === "card" ? column.items.find((item) => item.id === target.data.ticketId) : undefined;
					const edge = extractClosestEdge(target.data);
					const move: BoardMove = {
						ticket,
						column,
						...(anchor === undefined || edge === "bottom" ? {} : { before: anchor }),
						...(anchor === undefined || edge !== "bottom" ? {} : { after: anchor }),
					};
					if (column.statuses.length > 1 && !column.statuses.some((status) => status.id === ticket.status.id)) {
						onChooseStatus(move);
						return;
					}
					onMove(move);
				},
			}),
		[announce, columns, onChooseStatus, onMove],
	);
};

const combineCleanups =
	(...cleanups: (() => void)[]) =>
	() => {
		for (const cleanup of cleanups) cleanup();
	};
