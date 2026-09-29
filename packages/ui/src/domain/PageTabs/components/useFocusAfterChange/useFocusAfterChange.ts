import { type RefObject, useLayoutEffect, useRef } from "react";

// A flag that a strip action sets when the focus must land on the active
// tab after the next render, such as after a move or a close. When no tab
// draws the active id, the focus lands on the Add tab button.
export function useFocusAfterChange(
	listRef: RefObject<HTMLDivElement | null>,
	addButton: RefObject<HTMLButtonElement | null>,
	activeId: string,
) {
	const focusAfterChange = useRef(false);
	useLayoutEffect(() => {
		if (!focusAfterChange.current) return;
		focusAfterChange.current = false;
		const tab = Array.from(listRef.current!.querySelectorAll<HTMLElement>('[role="tab"]')).find(
			(element) => element.dataset.pageTabId === activeId,
		);
		(tab ?? addButton.current)?.focus({ preventScroll: true });
	});
	return focusAfterChange;
}
