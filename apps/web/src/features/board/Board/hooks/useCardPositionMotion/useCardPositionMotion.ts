import { readRowMotion, useReducedMotion } from "@trellis/ui";
import { animate } from "motion/mini";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";

type DropOrigin = { ticketId: string; priorBox: DOMRect };

const measuredTickets = (root: HTMLElement) =>
	[...root.querySelectorAll<HTMLElement>("[data-ticket-id]")].map((element) => ({
		element,
		ticketId: element.dataset.ticketId!,
		box: element.getBoundingClientRect(),
	}));

export const useCardPositionMotion = (
	boardRef: RefObject<HTMLElement | null>,
	boardLayout: unknown,
	positionRefresh: unknown,
	ready: boolean,
) => {
	const reducedMotion = useReducedMotion();
	const priorBoxes = useRef(new Map<string, DOMRect>());
	const dropOrigin = useRef<DropOrigin | null>(null);
	const activeMotions = useRef<ReturnType<typeof animate>[]>([]);

	// A root limits the box reads to one column after a column scroll.
	const refreshPositions = useCallback(
		(root?: HTMLElement) => {
			for (const motion of activeMotions.current) motion.complete();
			activeMotions.current = [];
			const board = boardRef.current;
			if (board === null) return;
			const scope = root ?? board;
			if (scope === board) {
				priorBoxes.current = new Map(measuredTickets(board).map(({ ticketId, box }) => [ticketId, box]));
				return;
			}
			const next = new Map(priorBoxes.current);
			for (const { ticketId, box } of measuredTickets(scope)) next.set(ticketId, box);
			priorBoxes.current = next;
		},
		[boardRef],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: boardLayout identifies a card order change.
	useLayoutEffect(() => {
		for (const motion of activeMotions.current) motion.complete();
		activeMotions.current = [];
		const board = boardRef.current;
		if (board === null) return;
		const cards = measuredTickets(board);
		const nextBoxes = new Map(cards.map(({ ticketId, box }) => [ticketId, box]));
		const previousBoxes = priorBoxes.current;
		const origin = dropOrigin.current;
		priorBoxes.current = nextBoxes;
		dropOrigin.current = null;
		if (reducedMotion) return;
		const transition = readRowMotion(board);

		for (const { element, ticketId, box } of cards) {
			const priorBox = origin?.ticketId === ticketId ? origin.priorBox : previousBoxes.get(ticketId);
			if (priorBox === undefined) continue;
			const dx = priorBox.left - box.left;
			const dy = priorBox.top - box.top;
			if (dx === 0 && dy === 0) continue;
			activeMotions.current.push(
				animate(element, { transform: [`translate(${dx}px, ${dy}px)`, "translate(0px, 0px)"] }, transition),
			);
		}
	}, [boardRef, boardLayout, reducedMotion]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: positionRefresh identifies a layout change without a card reorder.
	useLayoutEffect(() => {
		refreshPositions();
	}, [positionRefresh, refreshPositions]);

	useEffect(() => {
		if (!ready) return;
		const board = boardRef.current!;
		const observer = new ResizeObserver(() => refreshPositions());
		observer.observe(board);
		for (const element of board.querySelectorAll("section, ul")) observer.observe(element);
		let frame = 0;
		let scope: HTMLElement = board;
		const onScroll = (event: Event) => {
			// The scrolled list bounds the next box read to its own column.
			scope = event.target instanceof HTMLElement && event.target !== board ? event.target : board;
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				refreshPositions(scope);
			});
		};
		board.addEventListener("scroll", onScroll, true);
		const onResize = () => refreshPositions();
		window.addEventListener("resize", onResize);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			board.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", onResize);
		};
	}, [boardRef, ready, refreshPositions]);

	const recordDropOrigin = useCallback((ticketId: string, priorBox: DOMRect) => {
		dropOrigin.current = { ticketId, priorBox };
	}, []);
	const clearDropOrigin = useCallback(() => {
		dropOrigin.current = null;
	}, []);
	return { recordDropOrigin, clearDropOrigin };
};
