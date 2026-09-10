import {
	draggable,
	dropTargetForElements,
	monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { TicketSummary } from "@trellis/api";
import { createElement, type RefObject, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CardPreview } from "../components/CardPreview";
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

const edgeOf = (data: Record<string | symbol, unknown>) => {
	const edge = extractClosestEdge(data);
	return edge === "top" || edge === "bottom" ? edge : null;
};

export const useBoardAutoScroll = (ref: RefObject<HTMLElement | null>, enabled: boolean) => {
	useEffect(() => {
		if (!enabled) return;
		if (navigator.userAgent.includes("HappyDOM")) return;
		const element = ref.current!;
		return autoScrollForElements({ element, getAllowedAxis: () => "all" });
	}, [enabled, ref]);
};

export type CardDndState = {
	// The edge of this card where a hovered drop lands.
	closestEdge: "top" | "bottom" | null;
	// True from the start of this card's drag to its drop.
	dragging: boolean;
};

export const useCardDnd = (
	ref: RefObject<HTMLElement | null>,
	input: Omit<TicketData, "type">,
	announce: (message: string) => void,
	preview: { ticket: TicketSummary; showStatus: boolean },
): CardDndState => {
	const [closestEdge, setClosestEdge] = useState<"top" | "bottom" | null>(null);
	const [dragging, setDragging] = useState(false);
	const { ticketId, statusId, identifier, title, index, columnName, columnCount } = input;
	const { ticket, showStatus } = preview;
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
				// The drag library writes inline styles on `container` that clear
				// its fill, border, and padding. The preview therefore draws its
				// own card in a child element. The render is synchronous, because
				// the browser takes the snapshot as soon as `render` returns.
				onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
					setCustomNativeDragPreview({
						nativeSetDragImage,
						getOffset: preserveOffsetOnSource({ element, input: location.current.input }),
						render: ({ container }) => {
							const mount = document.createElement("div");
							container.appendChild(mount);
							const root = createRoot(mount);
							const width = element.getBoundingClientRect().width;
							flushSync(() => root.render(createElement(CardPreview, { ticket, width, showStatus })));
							return () => root.unmount();
						},
					});
				},
				onDragStart: () => {
					setDragging(true);
					announce(`${identifier} picked up from ${columnName}, position ${index + 1} of ${columnCount}`);
				},
				onDrop: () => setDragging(false),
			}),
			dropTargetForElements({
				element,
				canDrop: ({ source }) => isTicketData(source.data),
				getData: ({ input: pointer }) =>
					attachClosestEdge(
						{ type: "card", ticketId, statusId },
						{ element, input: pointer, allowedEdges: ["top", "bottom"] },
					),
				// The line shows on enter as well as on each drag update. A browser
				// can hold the next update while the pointer rests, and the
				// column's own line goes away as soon as a card is under the pointer.
				onDragEnter: ({ self }) => setClosestEdge(edgeOf(self.data)),
				onDrag: ({ self }) => setClosestEdge(edgeOf(self.data)),
				onDragLeave: () => setClosestEdge(null),
				onDrop: () => setClosestEdge(null),
			}),
		);
	}, [announce, columnCount, columnName, identifier, index, ref, statusId, ticketId, title, ticket, showStatus]);
	return { closestEdge, dragging };
};

// `over` is true while the pointer is over the column but over no card:
// the drop then lands after the last card.
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
				if (collapsed) timer = setTimeout(expand, 400);
			},
			onDrag: ({ location }) => setOver(location.current.dropTargets[0]?.data.type === "column"),
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

// The card a drop on the empty part of a column lands after: the last card
// of the column's one status. A column with several statuses gets no
// anchor, because the server orders a ticket only among its own status.
const lastCardOf = (column: BoardColumnModel, ticket: TicketSummary) => {
	const only = column.statuses.length === 1 ? column.statuses[0]!.id : null;
	return column.items.filter((item) => item.id !== ticket.id && item.status.id === only).at(-1);
};

export const useBoardMonitor = (
	columns: BoardColumnModel[],
	onMove: (move: BoardMove) => void,
	onChooseStatus: (move: BoardMove) => void,
	announce: (message: string) => void,
	// Receives the dragged card's box before the move, for the drop motion.
	onDropped: (ticketId: string, from: DOMRect) => void,
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
						target.data.type === "card"
							? column.items.find((item) => item.id === target.data.ticketId)
							: lastCardOf(column, ticket);
					const edge = target.data.type === "card" ? extractClosestEdge(target.data) : "bottom";
					onDropped(ticket.id, source.element.getBoundingClientRect());
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
		[announce, columns, onChooseStatus, onMove, onDropped],
	);
};

const combineCleanups =
	(...cleanups: (() => void)[]) =>
	() => {
		for (const cleanup of cleanups) cleanup();
	};
