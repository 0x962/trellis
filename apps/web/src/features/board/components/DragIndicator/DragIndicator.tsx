// The line that shows where a dragged card lands: 2 px, with a 6 px dot at
// its left end. A card lands at the top of the column it enters, so the
// line draws on the top edge of the first card. Cards sit 8 px apart, so a
// 5 px offset puts the line in the middle of the gap.
export function DragIndicator() {
	return (
		<span
			aria-hidden="true"
			data-drag-indicator=""
			data-edge="top"
			className="pointer-events-none absolute inset-x-0 -top-[5px] z-10 h-0.5 bg-accent"
		>
			<span className="absolute top-1/2 -left-1 size-1.5 -translate-y-1/2 rounded-sm bg-accent" />
		</span>
	);
}
