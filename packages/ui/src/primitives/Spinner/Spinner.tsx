import { cx } from "../../utils/cx";

export type SpinnerProps = {
	// The diameter in Tailwind size classes. The default matches the 14 px
	// icon slot of a button.
	className?: string;
};

// A turning ring that marks work in progress. It carries no accessible
// name: the element that holds it says what runs, through its own text or
// through `aria-busy`. A person who turns motion off sees a still ring, so
// the control still reads as busy.
export function Spinner({ className }: SpinnerProps) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			className={cx("size-3.5 shrink-0 animate-spin motion-reduce:animate-none", className)}
		>
			<circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
			<path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}
