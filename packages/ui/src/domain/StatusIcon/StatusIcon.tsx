import { CheckCircle, Circle, CircleDashed, XCircle } from "@phosphor-icons/react";
import { cx } from "../../utils/cx";

export type StatusCategory = "todo" | "started" | "review" | "done" | "canceled";

export type StatusIconProps = {
	category: StatusCategory;
	// For the review category: who reviews. An agent reviewer fills the ring.
	reviewer?: "human" | "agent";
	// For the started category: the share of sub-tickets that are done, 0 to 1.
	// Without it the disk is half full.
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

const icons = { todo: Circle, review: CircleDashed, done: CheckCircle, canceled: XCircle };

// The status mark by category, drawn with Phosphor icons. Done is the filled
// check circle. An agent review is the dashed ring in the duotone weight, so
// it differs from a human review in shape as well as in color. Started is the
// ring with a disk inside that fills clockwise from twelve o'clock by
// `progress`; a conic gradient draws the disk, because no icon draws an
// arbitrary share.
export function StatusIcon({ category, reviewer = "human", progress, label, className }: StatusIconProps) {
	const color = category === "review" && reviewer === "agent" ? "text-agent" : colors[category];
	const shared = {
		"data-category": category,
		"data-reviewer": category === "review" ? reviewer : undefined,
		role: label ? "img" : undefined,
		"aria-label": label,
		"aria-hidden": label ? undefined : ("true" as const),
	};
	if (category === "started") {
		return (
			<span
				{...shared}
				data-progress={progress}
				className={cx("relative inline-grid size-3.5 shrink-0 place-items-center", color, className)}
			>
				<Circle aria-hidden="true" className="size-full" />
				<span
					data-fill=""
					className="absolute size-1/2 rounded-round"
					style={{ backgroundImage: `conic-gradient(currentColor ${progress ?? 0.5}turn, transparent 0)` }}
				/>
			</span>
		);
	}
	const Icon = icons[category];
	const weight = category === "done" ? "fill" : category === "review" && reviewer === "agent" ? "duotone" : "regular";
	return <Icon {...shared} weight={weight} className={cx("size-3.5 shrink-0", color, className)} />;
}
