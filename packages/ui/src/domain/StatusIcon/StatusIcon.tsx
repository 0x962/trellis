import { CheckCircle, Circle, CircleDashed, XCircle } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type StatusCategory = "todo" | "started" | "review" | "done" | "canceled";
export type StatusColor = "fg" | "fg-muted" | "fg-faint" | "accent" | "agent" | "success" | "warning" | "danger";
export type ReviewShape = "human" | "agent" | "queue";

export type StatusIconProps = {
	category: StatusCategory;
	// For the review category: who reviews.
	reviewer?: "human" | "agent";
	// For the review category: the mark shape.
	reviewShape?: ReviewShape;
	// The status color token. Without it the category supplies the color.
	color?: StatusColor;
	// For the started category: the share of sub-tickets that are done, 0 to 1.
	// Without it the disk is half full.
	progress?: number;
	// The status name. A labeled icon is an image with a name, and it shows
	// that name in a tooltip. An unlabeled one is decoration beside the name
	// it stands for, and the control around it carries the name and the
	// tooltip.
	label?: string;
	tooltip?: boolean;
	focusable?: boolean;
	className?: string;
};

const colors: Record<StatusCategory, string> = {
	todo: "text-fg-faint",
	started: "text-warning",
	review: "text-accent",
	done: "text-success",
	canceled: "text-fg-faint",
};

const colorClasses: Record<StatusColor, string> = {
	fg: "text-fg",
	"fg-muted": "text-fg-muted",
	"fg-faint": "text-fg-faint",
	accent: "text-accent",
	agent: "text-agent",
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
};

const icons = { todo: Circle, review: CircleDashed, done: CheckCircle, canceled: XCircle };

const baseClass = "size-4 shrink-0";

function ReviewIcon({
	shape,
	color,
	shared,
	className,
}: {
	shape: ReviewShape;
	color: string;
	shared: Record<string, string | number | undefined>;
	className?: string;
}) {
	if (shape === "human") {
		return <CircleDashed {...shared} weight="regular" className={cx(baseClass, color, className)} />;
	}
	if (shape === "queue") {
		return (
			<span {...shared} className={cx("inline-grid place-items-center", baseClass, color, className)}>
				<span className="flex h-3.5 w-4 flex-col justify-center gap-px rounded-[2px] border border-current px-px">
					<i className="block h-px rounded-hairline bg-current" />
					<i className="block h-px rounded-hairline bg-current" />
				</span>
			</span>
		);
	}
	return (
		<span {...shared} className={cx("relative inline-grid place-items-center", baseClass, color, className)}>
			<span className="block size-3 rotate-45 rounded-[2px] border border-current bg-current/15" />
			<span className="absolute size-1 rounded-round bg-current" />
		</span>
	);
}

// The status mark by category. Review statuses can change both color and
// shape, so adjacent review columns do not collapse into one grey ring.
// Started is the ring with a disk inside that fills clockwise from twelve
// o'clock by `progress`; a conic gradient draws the disk, because no icon
// draws an arbitrary share. The share sits in `--status-progress`, which
// `tokens.css` registers as a number, so a caller such as the `wave-fill`
// utility can transition the disk from one share to another.
export function StatusIcon({
	category,
	reviewer = "human",
	reviewShape,
	color,
	progress,
	label,
	tooltip = true,
	focusable = true,
	className,
}: StatusIconProps) {
	const tone = color === undefined ? colors[category] : colorClasses[color];
	const shape = reviewShape ?? reviewer;
	const shared = {
		"data-category": category,
		"data-reviewer": category === "review" ? reviewer : undefined,
		"data-color": color,
		"data-review-shape": category === "review" ? shape : undefined,
		role: label ? "img" : undefined,
		"aria-label": label,
		"aria-hidden": label ? undefined : ("true" as const),
		tabIndex: label && tooltip && focusable ? 0 : undefined,
	};
	const icon = mark({ category, shape, tone, progress, shared, className });
	return label === undefined || !tooltip ? icon : <Tooltip content={label}>{icon}</Tooltip>;
}

// The drawn mark, without the tooltip around it.
function mark({
	category,
	shape,
	tone,
	progress,
	shared,
	className,
}: {
	category: StatusCategory;
	shape: ReviewShape;
	tone: string;
	progress?: number;
	shared: Record<string, string | number | undefined>;
	className?: string;
}) {
	if (category === "started") {
		return (
			<span
				{...shared}
				data-progress={progress}
				className={cx("relative inline-grid size-4 shrink-0 place-items-center", tone, className)}
			>
				<Circle aria-hidden="true" className="size-full" />
				<span
					data-fill=""
					className="absolute size-1/2 rounded-round"
					style={
						{
							"--status-progress": progress ?? 0.5,
							backgroundImage: "conic-gradient(currentColor calc(var(--status-progress) * 1turn), transparent 0)",
						} as CSSProperties
					}
				/>
			</span>
		);
	}
	if (category === "review") {
		return <ReviewIcon shape={shape} color={tone} shared={shared} className={className} />;
	}
	const Icon = icons[category];
	const weight = category === "done" ? "fill" : "regular";
	return <Icon {...shared} weight={weight} className={cx(baseClass, tone, className)} />;
}
