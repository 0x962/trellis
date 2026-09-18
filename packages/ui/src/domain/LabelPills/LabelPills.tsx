import { cx } from "../../utils/cx";
import { LabelDot } from "../LabelDot";
import { LabelPill } from "../LabelPill";
import type { LabelColor } from "../labelColors";
import { labelPillFrame } from "../labelPillFrame";

export type LabelPillItem = {
	id: string;
	name: string;
	color: LabelColor;
	// The name of the label group, or null for a label with no group.
	group: string | null;
};

export type LabelPillsProps = {
	labels: readonly LabelPillItem[];
	// The most pills one line shows. A longer list becomes one "N labels" pill.
	max?: number;
	// Draws every label and lets the pills wrap onto more lines.
	wrap?: boolean;
	className?: string;
};

const fullName = (label: LabelPillItem) => (label.group === null ? label.name : `${label.group} / ${label.name}`);

// The labels of one ticket. The default form is one line for a table cell:
// up to `max` pills, and above that one pill that reads "3 labels" behind a
// stack of up to three dots, one per distinct color. The form depends on the
// label count alone, never on a measured width, so a row keeps its layout
// when its data arrives. `wrap` is the form for a ticket page or a board
// card, where every label shows.
export function LabelPills({ labels, max = 2, wrap = false, className }: LabelPillsProps) {
	if (labels.length === 0) return null;
	if (wrap || labels.length <= max) {
		return (
			<span className={cx("flex min-w-0 items-center gap-1", wrap && "flex-wrap", className)}>
				{labels.map((label) => (
					<LabelPill key={label.id} name={label.name} color={label.color} group={label.group} />
				))}
			</span>
		);
	}
	const names = labels.map(fullName).join(", ");
	const colors = [...new Set(labels.map((label) => label.color))].slice(0, 3);
	return (
		<span className={cx("flex min-w-0 items-center", className)}>
			<span title={names} className={labelPillFrame}>
				{/* Each dot after the first covers 3 px of the dot before it. The 1 px
				    ring in the pill's own ground color keeps the two dots apart. */}
				<span aria-hidden="true" className="flex shrink-0 items-center">
					{colors.map((color, index) => (
						<LabelDot key={color} color={color} className={cx("ring-1 ring-surface", index > 0 && "-ml-0.75")} />
					))}
				</span>
				<span className="min-w-0 truncate">{labels.length} labels</span>
				<span className="sr-only">: {names}</span>
			</span>
		</span>
	);
}
