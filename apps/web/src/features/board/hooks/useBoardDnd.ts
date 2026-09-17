import {
	draggable,
	dropTargetForElements,
	monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { disableNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { useReducedMotion } from "@trellis/ui";
import { type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
	type DragPointer,
	type DragPreviewFrame,
	dragPreviewFrame,
	dragPreviewPosition,
	dragPreviewRotation,
} from "../dragPreview";
import type { BoardColumnModel, BoardMove } from "../types";

type TicketData = {
	type: "ticket";
	ticketId: string;
	// The column the card sits in. A column refuses a card it already holds.
	columnId: string;
	identifier: string;
	title: string;
	index: number;
	columnName: string;
	columnCount: number;
	previewFrame: DragPreviewFrame;
};

const isTicketData = (data: Record<string | symbol, unknown>): data is TicketData => data.type === "ticket";

export const useBoardAutoScroll = (ref: RefObject<HTMLElement | null>, enabled: boolean) => {
	useEffect(() => {
		if (!enabled) return;
		if (navigator.userAgent.includes("HappyDOM")) return;
		const element = ref.current!;
		return autoScrollForElements({ element, getAllowedAxis: () => "all" });
	}, [enabled, ref]);
};

export type CardDndState = {
	dragging: boolean;
	previewFrame: DragPreviewFrame | null;
	positionRef: RefObject<HTMLDivElement | null>;
	surfaceRef: RefObject<HTMLDivElement | null>;
};

export const useCardDnd = (
	ref: RefObject<HTMLElement | null>,
	input: Omit<TicketData, "type" | "previewFrame">,
	announce: (message: string) => void,
	// True for a ticket under an archived project.
	readOnly = false,
): CardDndState => {
	const reducedMotion = useReducedMotion();
	const [previewFrame, setPreviewFrame] = useState<DragPreviewFrame | null>(null);
	const positionRef = useRef<HTMLDivElement>(null);
	const surfaceRef = useRef<HTMLDivElement>(null);
	const { ticketId, columnId, identifier, title, index, columnName, columnCount } = input;
	useEffect(() => {
		const element = ref.current!;
		let frame: DragPreviewFrame;
		let previous: DragPointer;
		let settleTimer: ReturnType<typeof setTimeout> | undefined;

		const rotate = (degrees: number) => {
			surfaceRef.current!.style.transform = `rotate(${degrees}deg)`;
		};

		const movePreview = (pointer: DragPointer) => {
			const position = dragPreviewPosition(frame, pointer);
			positionRef.current!.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
			if (reducedMotion) return;
			rotate(dragPreviewRotation(frame, pointer, previous));
			if (settleTimer !== undefined) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => rotate(dragPreviewRotation(frame, pointer, pointer)), 80);
			previous = pointer;
		};

		const cleanup = draggable({
			element,
			// A ticket under an archived project takes no move, so no drag starts.
			canDrag: () => !readOnly,
			getInitialData: ({ input }) => {
				frame = dragPreviewFrame(element.getBoundingClientRect(), input);
				previous = input;
				return {
					type: "ticket",
					ticketId,
					columnId,
					identifier,
					title,
					index,
					columnName,
					columnCount,
					previewFrame: frame,
				};
			},
			onGenerateDragPreview: ({ nativeSetDragImage }) => {
				disableNativeDragPreview({ nativeSetDragImage });
			},
			onDragStart: ({ location }) => {
				flushSync(() => setPreviewFrame(frame));
				movePreview(location.current.input);
				announce(`${identifier} picked up from ${columnName}, position ${index + 1} of ${columnCount}`);
			},
			onDrag: ({ location }) => movePreview(location.current.input),
			onDrop: () => {
				if (settleTimer !== undefined) clearTimeout(settleTimer);
				setPreviewFrame(null);
			},
		});
		return () => {
			cleanup();
			if (settleTimer !== undefined) clearTimeout(settleTimer);
		};
	}, [announce, columnCount, columnId, columnName, identifier, index, readOnly, reducedMotion, ref, ticketId, title]);
	return { dragging: previewFrame !== null, previewFrame, positionRef, surfaceRef };
};

export const useColumnDnd = (
	ref: RefObject<HTMLElement | null>,
	column: BoardColumnModel,
	collapsed: boolean,
	expand: () => void,
) => {
	// BoardColumn uses the dragged ticket to mark its active or inactive group boundary.
	const [over, setOver] = useState<TicketData | null>(null);
	useEffect(() => {
		const element = ref.current!;
		let timer: ReturnType<typeof setTimeout> | undefined;
		return dropTargetForElements({
			element,
			canDrop: ({ source }) => isTicketData(source.data) && source.data.columnId !== column.id,
			getData: () => ({ type: "column", columnId: column.id }),
			onDragEnter: ({ source }) => {
				setOver(source.data as TicketData);
				if (collapsed) timer = setTimeout(expand, 400);
			},
			onDragLeave: () => {
				setOver(null);
				if (timer !== undefined) clearTimeout(timer);
			},
			onDrop: () => {
				setOver(null);
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
	// useCardPositionMotion needs this box before runMove changes the card's column.
	onDropped: (ticketId: string, priorBox: DOMRect) => void,
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
					const target = location.current.dropTargets[0];
					// A card's own column refuses it, so a drop there ends with no
					// target and leaves the board as it was.
					if (target === undefined) {
						announce("Drop canceled");
						return;
					}
					const ticket = columns.flatMap((column) => column.items).find((item) => item.id === data.ticketId)!;
					const column = columns.find((entry) => entry.id === target.data.columnId)!;
					const position = dragPreviewPosition(data.previewFrame, location.current.input);
					onDropped(
						ticket.id,
						new DOMRect(position.left, position.top, data.previewFrame.width, data.previewFrame.height),
					);
					const move: BoardMove = { ticket, column };
					if (column.statuses.length > 1) {
						onChooseStatus(move);
						return;
					}
					onMove(move);
				},
			}),
		[announce, columns, onChooseStatus, onMove, onDropped],
	);
};
