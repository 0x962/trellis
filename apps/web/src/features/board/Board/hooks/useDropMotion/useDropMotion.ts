import { useReducedMotion } from "@trellis/ui";
import { animate } from "motion/mini";
import { useCallback, useLayoutEffect, useRef } from "react";

// Slides a dropped card from its box before the move to its new slot in
// 150 ms. Only `transform` animates, so the columns never reflow during the
// motion. Under reduced motion the card lands in place.
// `trigger` is the value that changes when the move paints (the columns).
// The returned function records the dragged card's box at the drop.
export const useDropMotion = (trigger: unknown) => {
	const reducedMotion = useReducedMotion();
	const dropped = useRef<{ ticketId: string; from: DOMRect } | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the trigger is the repaint that holds the moved card.
	useLayoutEffect(() => {
		const drop = dropped.current;
		if (drop === null) return;
		const element = document.querySelector<HTMLElement>(`[data-ticket-id="${drop.ticketId}"]`);
		if (element === null) return;
		dropped.current = null;
		if (reducedMotion) return;
		const to = element.getBoundingClientRect();
		const dx = drop.from.left - to.left;
		const dy = drop.from.top - to.top;
		if (dx === 0 && dy === 0) return;
		animate(
			element,
			{ transform: [`translate(${dx}px, ${dy}px)`, "translate(0px, 0px)"] },
			{ duration: 0.15, ease: "easeOut" },
		);
	}, [trigger, reducedMotion]);

	return useCallback((ticketId: string, from: DOMRect) => {
		dropped.current = { ticketId, from };
	}, []);
};
