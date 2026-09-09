import { useCallback, useRef } from "react";

const tabbable =
	'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Focus handling for a popup that opens and closes: a Dialog, a Sheet, the
// Command dialog. `onPopupMount` goes on the popup's ref: the popup mounts
// when it opens, so the callback runs once per opening. It remembers the
// element that had focus (the opener) and moves focus onto the popup's first
// tabbable element, or onto the popup itself when it has none. `finalFocus`
// goes on the popup's `finalFocus` prop, so a close returns focus to the
// opener.
//
// Base UI defers its own initial focus to the next animation frame; a
// synchronous move keeps focus where the user already put it when they act
// inside that frame. The move happens before Base UI records the opener, so
// the opener is recorded here.
export function usePopupFocus() {
	const opener = useRef<HTMLElement | null>(null);
	const onPopupMount = useCallback((popup: HTMLElement | null) => {
		if (!popup) return;
		opener.current = document.activeElement as HTMLElement | null;
		(popup.querySelector<HTMLElement>(tabbable) ?? popup).focus();
	}, []);
	const finalFocus = useCallback(() => opener.current, []);
	return { onPopupMount, finalFocus };
}
