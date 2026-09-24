// The box that the person can see around `element`: the nearest ancestor
// that scrolls, or the window when no ancestor scrolls.
const viewBox = (element: HTMLElement) => {
	for (let node = element.parentElement; node !== null; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
			return node.getBoundingClientRect();
		}
	}
	return { top: 0, bottom: element.ownerDocument.defaultView?.innerHeight ?? 0 };
};

// Gives the focus to `element`, and scrolls it into view only when the person
// cannot see it.
//
// A browser scrolls a focused element into view against the place that element
// would take with no `position: sticky`. A group header that stands at the top
// of a list sits far below that place, so a plain `focus()` moves the list away
// from the person. This reads the box the element draws now, which is the place
// the person sees, and scrolls only when that box lies outside the view.
export const focusInView = (element: HTMLElement) => {
	const box = element.getBoundingClientRect();
	const view = viewBox(element);
	element.focus({ preventScroll: true });
	if (box.top >= view.top && box.bottom <= view.bottom) return;
	element.scrollIntoView({ block: "nearest" });
};
