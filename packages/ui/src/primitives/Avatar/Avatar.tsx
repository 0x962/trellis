import { cx } from "../../utils/cx";
import { agentGradient } from "./agentGradient";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	className?: string;
};

// "Dana Lee" gives DL; "dana" gives D.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

// An 18 px actor mark. A human is a circle with initials. An agent is a
// circle filled with the soft color its name picks. See agentGradient.
export function Avatar({ kind, name, className }: AvatarProps) {
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? `${name} · agent` : name}
			style={kind === "agent" ? agentGradient(name) : undefined}
			className={cx(
				"relative inline-grid size-4.5 shrink-0 place-items-center rounded-round select-none",
				kind === "human" && "bg-fg-muted text-surface text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? null : initials(name)}
		</span>
	);
}
