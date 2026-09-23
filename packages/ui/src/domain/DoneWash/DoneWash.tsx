import type { CSSProperties } from "react";
import { cx } from "../../utils/cx";
import { doneWashMs } from "./timing";

export type DoneWashProps = { className?: string };

// A green band that crosses a ticket row once when the ticket is marked
// done. The band opens from the left edge of the row to its full width,
// and then it fades where it stands. The caller mounts it for `doneWashMs`
// and then removes it.
//
// The band fills the row box and sits under the cells, so the words of the
// row stay legible while it passes. It animates `opacity` and `clip-path`
// and never `transform`: the row element itself carries the offset of the
// virtual list, and `useLineMotion` animates that offset.
//
// The last frame of the band is clear, so a row that keeps the band a
// little longer than the animation shows nothing.
//
// The person who asked the system for less motion sees nothing: the caller
// does not mount this.
export function DoneWash({ className }: DoneWashProps) {
	return (
		<span
			aria-hidden="true"
			data-done-wash=""
			style={{ "--done-wash-run": `${doneWashMs}ms` } as CSSProperties}
			className={cx(
				"pointer-events-none absolute inset-0 z-0 block bg-success-soft opacity-0 done-wash motion-reduce:animate-none",
				className,
			)}
		/>
	);
}
