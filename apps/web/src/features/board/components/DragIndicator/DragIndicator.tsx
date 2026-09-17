// The negative offset centers the line in the gap between cards.
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
