import { cx } from "../../utils/cx";

export type TrellisMarkProps = {
	// The accessible name. Without it the mark is decoration, as it is next
	// to the word "trellis".
	label?: string;
	// The size, 16 px by default.
	className?: string;
};

// Two strokes in each diagonal direction on a 32 px grid. They cross into
// one whole diamond with four half diamonds around it. The square stays
// dark in both themes, so the mark is the same drawing as the favicon.
const strokes = ["M13 8 24 19", "M8 13 19 24", "M8 19 19 8", "M13 24 24 13"];

export function TrellisMark({ label, className = "size-4" }: TrellisMarkProps) {
	return (
		<svg
			viewBox="0 0 32 32"
			role={label === undefined ? undefined : "img"}
			aria-label={label}
			aria-hidden={label === undefined ? "true" : undefined}
			className={cx("shrink-0", className)}
		>
			<rect width="32" height="32" rx="7" className="fill-mark" />
			{strokes.map((d) => (
				<path key={d} d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-accent" />
			))}
		</svg>
	);
}
