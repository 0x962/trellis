import {
	draggable,
	dropTargetForElements,
	monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import type { TicketSummary } from "@trellis/api";
import { createElement, type RefObject, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CardPreview } from "../components/CardPreview";
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
	// True from the start of this card's drag to its drop.
	dragging: boolean;
};

export const useCardDnd = (
	ref: RefObject<HTMLElement | null>,
	input: Omit<TicketData, "type">,
	announce: (message: string) => void,
	preview: { ticket: TicketSummary; showStatus: boolean },
	// True for a ticket under an archived project.
	readOnly = false,
): CardDndState => {
	const [dragging, setDragging] = useState(false);
	const { ticketId, columnId, identifier, title, index, columnName, columnCount } = input;
	const { ticket, showStatus } = preview;
	useEffect(() => {
		const element = ref.current!;
		return draggable({
			element,
			// A ticket under an archived project takes no move, so no drag starts.
			canDrag: () => !readOnly,
			getInitialData: () => ({
				type: "ticket",
				ticketId,
				columnId,
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
		});
	}, [
		announce,
		columnCount,
		columnId,
		columnName,
		identifier,
		index,
		readOnly,
		ref,
		ticketId,
		title,
		ticket,
		showStatus,
	]);
	return { dragging };
};

// `over` is true while a card from another column hangs over this column.
// The card lands at the top of the column, so the column marks that one
// place. A column refuses a card it already holds, so a drag inside a
// column marks nothing.
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
			canDrop: ({ source }) => isTicketData(source.data) && source.data.columnId !== column.id,
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
					const target = location.current.dropTargets[0];
					// A card's own column refuses it, so a drop there ends with no
					// target and leaves the board as it was.
					if (target === undefined) {
						announce("Drop canceled");
						return;
					}
					const ticket = columns.flatMap((column) => column.items).find((item) => item.id === data.ticketId)!;
					const column = columns.find((entry) => entry.id === target.data.columnId)!;
					onDropped(ticket.id, source.element.getBoundingClientRect());
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
