import { cx } from "../../utils/cx";
import { AgentMark, type AgentMarkKind, type AgentMarkState } from "../AgentMark";
import { Tooltip } from "../Tooltip";
import { type AgentProfile, AgentProfileMark } from "./components/AgentProfileMark";
import { AgentStatus, type AgentStatusValue } from "./components/AgentStatus";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	className?: string;
	agentKind?: AgentMarkKind;
	agentProfile?: AgentProfile;
	state?: AgentMarkState;
	status?: AgentStatusValue;
	tooltip?: boolean;
	focusable?: boolean;
};

// "Dana Lee" gives DL; "dana" gives D.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

export function Avatar({
	kind,
	name,
	className,
	agentKind,
	agentProfile,
	state = "static",
	status,
	tooltip = true,
	focusable = true,
}: AvatarProps) {
	const agentLabel = `${name} · agent${agentProfile ? ` · ${agentProfile.model}${agentProfile.effort ? ` · ${agentProfile.effort}` : ""}` : ""}${state === "static" ? "" : " · working"}`;
	const label = kind === "agent" ? `${agentLabel}${status ? ` · ${status.replaceAll("-", " ")}` : ""}` : name;
	// The initials use a span because `profile-metal` paints a film and lifts
	// only its child span above the film.
	const avatar = (
		<span
			role="img"
			aria-label={label}
			tabIndex={tooltip && focusable ? 0 : undefined}
			className={cx(
				"group/avatar relative inline-grid size-4.5 shrink-0 place-items-center rounded-round select-none hover:z-30",
				kind === "human" && "profile-metal text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? (
				agentProfile ? (
					<AgentProfileMark profile={agentProfile} state={state} />
				) : (
					<AgentMark name={name} kind={agentKind} state={state} />
				)
			) : (
				<span>{initials(name)}</span>
			)}
			{kind === "agent" && status && status !== "working" && <AgentStatus status={status} />}
		</span>
	);
	return tooltip ? <Tooltip content={label}>{avatar}</Tooltip> : avatar;
}
