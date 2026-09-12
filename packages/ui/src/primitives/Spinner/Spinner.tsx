import { CircleNotch } from "@phosphor-icons/react";
import { cx } from "../../utils/cx";

export type SpinnerProps = {
	// The diameter in Tailwind size classes. The default matches the 14 px
	// icon slot of a button.
	className?: string;
};

// A turning arc that marks work in progress. It carries no accessible
// name: the element that holds it says what runs, through its own text or
// through `aria-busy`. A person who turns motion off sees a still arc, so
// the control still reads as busy.
export function Spinner({ className }: SpinnerProps) {
	return (
		<CircleNotch
			aria-hidden="true"
			weight="bold"
			className={cx("size-3.5 shrink-0 animate-spin motion-reduce:animate-none", className)}
		/>
	);
}
