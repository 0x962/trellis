import { cx } from "../../utils/cx";

export type SkeletonProps = {
	// A Tailwind width class, such as "w-32" or "w-full".
	width?: string;
	// A Tailwind height class. The default is one line of 13 px text.
	height?: string;
	lines?: number;
	className?: string;
};

// A placeholder for text that has not arrived. It dims and brightens in
// place: a placeholder that changed size would misreport the layout it
// stands in for. Assistive tech skips it; the surrounding region announces
// the loading state through aria-busy.
export function Skeleton({ width = "w-full", height = "h-3", lines = 1, className }: SkeletonProps) {
	return (
		<div aria-busy="true" aria-hidden="true" className={cx("flex flex-col gap-2", className)}>
			{[...Array(lines).keys()].map((line) => (
				<div
					key={line}
					className={cx(
						"rounded-sm bg-border animate-pulse-live pulse-in-place motion-reduce:animate-none",
						width,
						height,
					)}
				/>
			))}
		</div>
	);
}
