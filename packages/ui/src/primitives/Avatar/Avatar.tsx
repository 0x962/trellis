import { cx } from "../../utils/cx";
import { PersonaMark } from "../PersonaMark";
import type { PersonaKind, PersonaState } from "../PersonaMark/personaAppearance";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	className?: string;
	personaKind?: PersonaKind;
	state?: PersonaState;
};

// "Dana Lee" gives DL; "dana" gives D.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

export function Avatar({ kind, name, className, personaKind, state = "static" }: AvatarProps) {
	// The initials use a span because `profile-metal` paints a film and lifts
	// only its child span above the film.
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? `${name} · agent${state === "static" ? "" : " · working"}` : name}
			className={cx(
				"relative inline-grid size-4.5 shrink-0 place-items-center rounded-round select-none",
				kind === "human" && "profile-metal text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? <PersonaMark name={name} kind={personaKind} state={state} /> : <span>{initials(name)}</span>}
		</span>
	);
}
