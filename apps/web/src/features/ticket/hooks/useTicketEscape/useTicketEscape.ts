import { useCallback, useRef } from "react";
import { useEscapeLayer } from "../../../../lib/hotkeys";

type TicketEscapeElement = Pick<HTMLElement, "blur" | "isContentEditable" | "matches" | "textContent"> & {
	value?: string;
};

const holdsTypedText = (element: TicketEscapeElement) => {
	if (element.matches("input, textarea")) return element.value !== "";
	return element.isContentEditable && element.textContent !== "";
};

export const runTicketEscape = (focused: TicketEscapeElement | null, returnToList: () => void) => {
	// Composer stores a comment draft only in React state. Blur keeps the
	// draft on the ticket, and the next Escape press can return to the list.
	if (focused !== null && holdsTypedText(focused)) {
		focused.blur();
		return;
	}
	returnToList();
};

export function useTicketEscape(returnToList: () => void) {
	const latestReturnToList = useRef(returnToList);
	latestReturnToList.current = returnToList;
	const onEscape = useCallback(() => {
		const focused = document.activeElement;
		runTicketEscape(focused instanceof HTMLElement ? focused : null, latestReturnToList.current);
	}, []);
	useEscapeLayer("ticket", true, onEscape);
}
