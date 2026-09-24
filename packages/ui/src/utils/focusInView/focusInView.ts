// The nearest ancestor that scrolls on one axis, or null when nothing above
// the element scrolls on it. The two axes can belong to different ancestors,
// as in a table whose rows scroll sideways inside a pane that scrolls down.
const scrollerOf = (element: HTMLElement, axis: "across" | "down") => {
	for (let node = element.parentElement; node !== null; node = node.parentElement) {
		const style = getComputedStyle(node);
		const overflow = axis === "down" ? style.overflowY : style.overflowX;
		const room = axis === "down" ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth;
		if (room && (overflow === "auto" || overflow === "scroll")) return node;
	}
	return null;
};

// Gives the focus to `element`, and brings it into view only when the person
// cannot see it.
//
// A browser scrolls a focused element into view against the place that element
// would take with no `position: sticky`. A group header that stands at the top
// of a list sits far below that place, so a plain `focus()` moves the list away
// from the person. This reads the box the element draws now, which is the place
// the person sees.
//
// A box that lies above or below the view takes the browser's own scroll, which
// moves both axes. A box that the view holds from top to bottom, and that lies
// left or right of the view, takes a sideways scroll alone, so the list keeps
// the offset the person reads.
export const focusInView = (element: HTMLElement) => {
	const box = element.getBoundingClientRect();
	const down = scrollerOf(element, "down");
	const across = scrollerOf(element, "across");
	const frame = element.ownerDocument.defaultView;
	const view = down?.getBoundingClientRect() ?? { top: 0, bottom: frame?.innerHeight ?? 0 };
	element.focus({ preventScroll: true });
	if (box.top < view.top || box.bottom > view.bottom) {
		element.scrollIntoView({ block: "nearest", inline: "nearest" });
		return;
	}
	if (across === null) return;
	const side = across.getBoundingClientRect();
	if (box.left < side.left) across.scrollLeft -= side.left - box.left;
	else if (box.right > side.right) across.scrollLeft += box.right - side.right;
};
