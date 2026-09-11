import { cx } from "../../utils/cx";
import { agentGradient } from "./agentGradient";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	// A live actor has an active session. The dot pulses; under reduced
	// motion it stands still.
	live?: boolean;
	className?: string;
};

// "Dana Lee" gives DL; "dana" gives D.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

// An 18 px actor mark. A human is a square with initials. An agent is a
// circle filled with the soft color its name picks, so two agents never
// look alike and one agent always looks the same. See agentGradient.
export function Avatar({ kind, name, live = false, className }: AvatarProps) {
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? `${name} · agent` : name}
			style={kind === "agent" ? agentGradient(name) : undefined}
			className={cx(
				"relative inline-grid size-4.5 shrink-0 place-items-center overflow-hidden select-none",
				kind === "agent" ? "rounded-full" : "rounded-sm bg-fg-muted text-surface text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? null : initials(name)}
			{live && (
				<span
					data-live=""
					className="absolute -top-0.75 -right-0.75 size-1.75 rounded-sm border-2 border-surface bg-success animate-pulse-live motion-reduce:animate-none"
				/>
			)}
		</span>
	);
}
