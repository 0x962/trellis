import { type RefObject, useLayoutEffect, useRef } from "react";

// An action can focus a specific tab or the active tab after a render.
// The active tab or Add tab receives focus when the target leaves the strip.
export function useFocusAfterChange(
	listRef: RefObject<HTMLDivElement | null>,
	addButton: RefObject<HTMLButtonElement | null>,
	activeId: string,
) {
	const focusAfterChange = useRef<boolean | string>(false);
	useLayoutEffect(() => {
		if (!focusAfterChange.current) return;
		const targetId = typeof focusAfterChange.current === "string" ? focusAfterChange.current : activeId;
		focusAfterChange.current = false;
		const tabs = Array.from(listRef.current!.querySelectorAll<HTMLElement>('[role="tab"]'));
		const tab =
			tabs.find((element) => element.dataset.pageTabId === targetId) ??
			tabs.find((element) => element.dataset.pageTabId === activeId);
		(tab ?? addButton.current)?.focus({ preventScroll: true });
	});
	return focusAfterChange;
}
