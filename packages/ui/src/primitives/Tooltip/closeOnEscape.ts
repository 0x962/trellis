// Closes an open tooltip on the Escape key, and leaves the key press itself
// alone for whatever stands under the tooltip.
//
// Base UI closes the innermost open popup on Escape and stops the key press
// there. A tooltip counts as such a popup, so a dialog under an open tooltip
// stays open until a second Escape. This listener runs on the document in the
// capture phase, which comes before every Base UI handler, and it neither
// stops the key press nor prevents its default. The caller closes the tooltip
// inside `close` with `flushSync`, so the tooltip is off the page before Base
// UI reads the same key press and the dialog under it closes on that press.
//
// An Escape that something else already answered carries `defaultPrevented`.
// The tooltip stays open for that one, because the key press belonged to that
// other handler.
export function closeTooltipOnEscape(target: EventTarget, close: () => void): () => void {
	const onKeyDown = (event: Event) => {
		if ((event as KeyboardEvent).key !== "Escape" || event.defaultPrevented) return;
		close();
	};
	target.addEventListener("keydown", onKeyDown, true);
	return () => target.removeEventListener("keydown", onKeyDown, true);
}
