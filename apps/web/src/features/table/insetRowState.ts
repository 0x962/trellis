import { cx } from "@trellis/ui";

const insetRowBoundary =
	"isolate after:pointer-events-none after:absolute after:inset-x-3 after:inset-y-px after:-z-10 after:rounded-sm after:transition-colors after:duration-hover after:ease-out after:content-[''] max-md:after:inset-x-2";

export const insetRowHover = cx(insetRowBoundary, "hover:after:bg-band");

export const insetRowControl = cx(
	insetRowHover,
	"focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent focus-visible:after:-outline-offset-2",
);

export const insetRowSelection = cx(
	insetRowHover,
	"data-focused:after:bg-accent-soft/60 data-selected:after:bg-accent-soft",
);
