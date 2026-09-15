import { cx } from "../../utils/cx";
import { PersonaMark } from "./components/PersonaMark";

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

export function Avatar({ kind, name, className }: AvatarProps) {
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? `${name} · agent` : name}
			className={cx(
				"relative inline-grid size-4.5 shrink-0 place-items-center rounded-round select-none",
				kind === "human" && "bg-fg-muted text-surface text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? <PersonaMark name={name} /> : initials(name)}
		</span>
	);
}
