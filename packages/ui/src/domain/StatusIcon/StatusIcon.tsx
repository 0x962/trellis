import { cx } from "../../utils/cx";

export type StatusCategory = "todo" | "started" | "review" | "done" | "canceled";

export type StatusIconProps = {
	category: StatusCategory;
	// For the review category: who reviews. An agent reviewer carries the glyph.
	reviewer?: "human" | "agent";
	// For the started category: the share of sub-tickets that are done, 0 to 1.
	// Without it the ring is half full.
	progress?: number;
	// The status name. A labeled icon is an image with a name; an unlabeled one
	// is decoration beside the name it stands for.
	label?: string;
	className?: string;
};

const colors: Record<StatusCategory, string> = {
	todo: "text-fg-faint",
	started: "text-warning",
	review: "text-accent",
	done: "text-success",
	canceled: "text-fg-faint",
};

// The wedge from twelve o'clock, clockwise, covering `fraction` of a disk of
// radius 4 centered at (8, 8). A full disk cannot be one arc, so it is a circle.
const wedge = (fraction: number) => {
	const angle = 2 * Math.PI * fraction;
	const x = (8 + 4 * Math.sin(angle)).toFixed(3);
	const y = (8 - 4 * Math.cos(angle)).toFixed(3);
	const largeArc = fraction > 0.5 ? 1 : 0;
	return `M8 8 L8 4 A4 4 0 ${largeArc} 1 ${x} ${y} Z`;
};

// The status mark by category. Reviewer and progress refine two of them.
export function StatusIcon({ category, reviewer = "human", progress, label, className }: StatusIconProps) {
	const color = category === "review" && reviewer === "agent" ? "text-agent" : colors[category];
	return (
		<svg
			data-category={category}
			data-reviewer={category === "review" ? reviewer : undefined}
			data-progress={progress}
			viewBox="0 0 16 16"
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : "true"}
			className={cx("size-3.5 shrink-0", color, className)}
		>
			{category === "todo" && <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />}
			{category === "started" && (
				<>
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
					{progress === 1 ? (
						<circle cx="8" cy="8" r="4" fill="currentColor" />
					) : (
						<path d={wedge(progress ?? 0.5)} fill="currentColor" />
					)}
				</>
			)}
			{category === "review" && (
				<>
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
					{reviewer === "agent" && <path d="M8 5.2 9.4 8 8 10.8 6.6 8z" fill="currentColor" />}
				</>
			)}
			{category === "done" && (
				<>
					<circle cx="8" cy="8" r="6.5" fill="currentColor" />
					<path
						d="m5.2 8.2 1.9 1.9 3.8-4"
						fill="none"
						className="stroke-surface"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
			)}
			{category === "canceled" && (
				<>
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
					<path
						d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</>
			)}
		</svg>
	);
}
