import { useCallback, useRef } from "react";
import { useEscapeLayer } from "../../../../lib/hotkeys";

type TicketEscapeElement = Pick<HTMLElement, "blur" | "isContentEditable" | "matches" | "textContent"> & {
	value?: string;
};

type TicketEscapeActions = {
	reviewOpen: boolean;
	closeReview: () => void;
	returnToList: () => void;
};

const holdsTypedText = (element: TicketEscapeElement) => {
	if (element.matches("input, textarea")) return element.value !== "";
	return element.isContentEditable && element.textContent !== "";
};

export const runTicketEscape = (focused: TicketEscapeElement | null, actions: TicketEscapeActions) => {
	// Composer stores a comment draft only in React state. Blur preserves the draft
	// before a later Escape calls `closeReview` or `returnToList`.
	if (focused !== null && holdsTypedText(focused)) {
		focused.blur();
		return;
	}
	if (actions.reviewOpen) {
		actions.closeReview();
		return;
	}
	actions.returnToList();
};

export function useTicketEscape(actions: TicketEscapeActions) {
	const latestActions = useRef(actions);
	latestActions.current = actions;
	const onEscape = useCallback(() => {
		const focused = document.activeElement;
		runTicketEscape(focused instanceof HTMLElement ? focused : null, latestActions.current);
	}, []);
	useEscapeLayer("ticket", true, onEscape);
}
