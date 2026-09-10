import { type ActorKind, Avatar } from "../../primitives/Avatar";
import { cx } from "../../utils/cx";

export type ActorChipProps = {
	name: string;
	kind: ActorKind;
	// A live actor has an active session; the Avatar shows the dot.
	live?: boolean;
	// Drops the "· agent" suffix, for a narrow row. The mono purple name
	// still tells an agent from a human.
	compact?: boolean;
	className?: string;
};

// An actor as it appears in a timeline or a rail: the Avatar and the name.
// An agent name is mono and purple with an "· agent" suffix, so a human and
// an agent never read alike.
export function ActorChip({ name, kind, live = false, compact = false, className }: ActorChipProps) {
	return (
		<span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
			<Avatar kind={kind} name={name} live={live} />
			<span className={kind === "agent" ? "font-mono text-sm text-agent" : "font-medium text-fg"}>{name}</span>
			{kind === "agent" && !compact && <span className="text-sm text-fg-faint">· agent</span>}
		</span>
	);
}
