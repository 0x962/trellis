import { type ActorKind, Avatar } from "../../primitives/Avatar";
import { cx } from "../../utils/cx";

export type ActorChipProps = {
	name: string;
	kind: ActorKind;
	// A live actor has an active session; the Avatar shows the dot.
	live?: boolean;
	// Drops the "· agent" suffix for a narrow row.
	compact?: boolean;
	className?: string;
};

// An actor as it appears in a timeline or a rail: the Avatar and the name.
// The "· agent" suffix distinguishes an agent from a human.
export function ActorChip({ name, kind, live = false, compact = false, className }: ActorChipProps) {
	return (
		<span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
			<Avatar kind={kind} name={name} live={live} />
			<span className={kind === "agent" ? "text-sm text-fg" : "font-medium text-fg"}>{name}</span>
			{kind === "agent" && !compact && <span className="text-sm text-fg-faint">· agent</span>}
		</span>
	);
}
