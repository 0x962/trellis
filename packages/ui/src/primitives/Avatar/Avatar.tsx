import { cx } from "../../utils/cx";
import { BotGlyph } from "./components/BotGlyph";

export type ActorKind = "human" | "agent";

export type AvatarProps = {
	kind: ActorKind;
	name: string;
	// A live actor has an active session. The dot pulses; under reduced
	// motion it stands still.
	live?: boolean;
	className?: string;
};

// "Navid Khan" gives NK; "navid" gives N.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

// An 18 px actor mark. A human is a circle with initials. An agent is a
// rounded square with the bot glyph, so the two kinds never look alike.
export function Avatar({ kind, name, live = false, className }: AvatarProps) {
	return (
		<span
			role="img"
			aria-label={kind === "agent" ? `${name} · agent` : name}
			className={cx(
				"relative inline-grid size-4.5 shrink-0 place-items-center select-none",
				kind === "agent"
					? "rounded-sm border border-agent bg-agent-soft text-agent"
					: "rounded-full bg-fg-muted text-surface text-initials font-semibold",
				className,
			)}
		>
			{kind === "agent" ? <BotGlyph /> : initials(name)}
			{live && (
				<span
					data-live=""
					className="absolute -top-0.75 -right-0.75 size-1.75 rounded-full border-2 border-surface bg-success animate-pulse-live motion-reduce:animate-none"
				/>
			)}
		</span>
	);
}
