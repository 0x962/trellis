export type DragIndicatorProps = {
	// The edge of the card where the drop lands.
	edge: "top" | "bottom";
};

// The line that shows where a dragged card lands: 2 px, with a 6 px dot at
// its left end. Cards sit 8 px apart, so a 5 px offset puts the line in the
// middle of the gap.
export function DragIndicator({ edge }: DragIndicatorProps) {
	return (
		<span
			aria-hidden="true"
			data-drag-indicator=""
			data-edge={edge}
			className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-accent ${edge === "top" ? "-top-[5px]" : "-bottom-[5px]"}`}
		>
			<span className="absolute top-1/2 -left-1 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
		</span>
	);
}
