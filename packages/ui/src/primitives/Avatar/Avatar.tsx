import { cx } from "../../utils/cx";
import { AgentMark, type AgentMarkKind, type AgentMarkState } from "../AgentMark";
import { type AgentProfile, AgentProfileMark } from "./components/AgentProfileMark";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	className?: string;
	agentKind?: AgentMarkKind;
	agentProfile?: AgentProfile;
	state?: AgentMarkState;
};

// "Dana Lee" gives DL; "dana" gives D.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

export function Avatar({ kind, name, className, agentKind, agentProfile, state = "static" }: AvatarProps) {
	const agentLabel = `${name} · agent${agentProfile ? ` · ${agentProfile.model}${agentProfile.effort ? ` · ${agentProfile.effort}` : ""}` : ""}${state === "static" ? "" : " · working"}`;
	// The initials use a span because `profile-metal` paints a film and lifts
	// only its child span above the film.
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? agentLabel : name}
			className={cx(
				"group/avatar relative inline-grid size-4.5 shrink-0 place-items-center rounded-round select-none hover:z-30",
				kind === "human" && "profile-metal text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? (
				agentProfile ? (
					<AgentProfileMark profile={agentProfile} working={state !== "static"} />
				) : (
					<AgentMark name={name} kind={agentKind} state={state} />
				)
			) : (
				<span>{initials(name)}</span>
			)}
		</span>
	);
}
