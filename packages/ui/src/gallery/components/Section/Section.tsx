import type { ReactNode } from "react";
import { cx } from "../../../utils/cx";

export type SectionProps = {
	// The component name. It is the heading, so one heading exists per name.
	name: string;
	note?: string;
	children: ReactNode;
	className?: string;
};

// One gallery block: a heading, an optional note, and the examples in a row.
export function Section({ name, note, children, className }: SectionProps) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-baseline gap-3">
				<h2 className="text-md font-semibold text-fg">{name}</h2>
				{note && <p className="text-sm text-fg-muted">{note}</p>}
			</div>
			<div
				className={cx("flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4", className)}
			>
				{children}
			</div>
		</section>
	);
}
