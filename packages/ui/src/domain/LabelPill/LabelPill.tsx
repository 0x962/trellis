import { cx } from "../../utils/cx";
import { LabelDot } from "../LabelDot";
import type { LabelColor } from "../labelColors";
import { labelPillFrame } from "../labelPillFrame";

export type LabelPillProps = {
	name: string;
	color: LabelColor;
	// The name of the label group that holds the label. A label with no group
	// passes null or leaves it out.
	group?: string | null;
	// Hover text, such as the label description.
	title?: string;
	className?: string;
};

// One ticket label: the color dot, then the name. A label of a group prints
// the group name first in muted text, then a slash: "Type / Bug". The group
// name takes at most 96 px, so the label name keeps the rest of the width.
// Every part is a span, so the pill can sit inside a button.
export function LabelPill({ name, color, group, title, className }: LabelPillProps) {
	return (
		<span title={title} className={cx(labelPillFrame, className)}>
			<LabelDot color={color} />
			<span className="flex min-w-0 items-center">
				{group != null && (
					<>
						<span className="max-w-24 shrink-0 truncate text-fg-muted">{group}</span>
						<span className="shrink-0 px-1 text-fg-faint">/</span>
					</>
				)}
				<span className="min-w-0 truncate">{name}</span>
			</span>
		</span>
	);
}
