import { type ReactNode, useId, useRef } from "react";
import { type AgentMarkKind, type AgentMarkState, agentAppearance, boxLines, trellisLines } from "./agentAppearance";
import { useAgentMotion } from "./useAgentMotion";

const stops = [
	[0, "pink", 0],
	[0.16, "pink", 1],
	[0.32, "violet", 1],
	[0.46, "blue", 1],
	[0.6, "mint", 1],
	[0.73, "gold", 1],
	[0.86, "pink", 1],
	[1, "pink", 0],
] as const;

function Artwork({ kind, letters, moving = false }: { kind: AgentMarkKind; letters: string; moving?: boolean }) {
	return (
		<g className={moving ? "agent-rotor" : undefined}>
			{(kind === "trellis" ? trellisLines : boxLines).map((d, index) => (
				<path key={d} d={d} data-piece={moving ? index : undefined} />
			))}
			{kind === "agent" && (
				<text x="16" y="16">
					{letters}
				</text>
			)}
		</g>
	);
}

function Glimmer({ id, children }: { id: string; children: ReactNode }) {
	return (
		<>
			<defs>
				<mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
					<g className="agent-mask">{children}</g>
				</mask>
				<linearGradient id={`${id}-film`} gradientUnits="userSpaceOnUse" x1="-30" y1="-12" x2="30" y2="12">
					{stops.map(([offset, color, opacity]) => (
						<stop key={offset} offset={offset} stopColor={`var(--film-${color})`} stopOpacity={opacity} />
					))}
				</linearGradient>
			</defs>
			<g className="agent-glimmer" mask={`url(#${id}-mask)`}>
				<rect className="agent-film" x="-90" y="-90" width="180" height="180" fill={`url(#${id}-film)`} />
			</g>
		</>
	);
}

export function AgentMark({
	name,
	kind,
	state = "static",
	background = true,
	label,
	className = "size-full",
}: {
	name: string;
	kind?: AgentMarkKind;
	state?: AgentMarkState;
	background?: boolean;
	label?: string;
	className?: string;
}) {
	const appearance = agentAppearance(name, kind);
	const mode = state === "working" && appearance.kind !== "trellis" ? "working-mild" : state;
	const id = useId();
	const ref = useRef<SVGSVGElement>(null);
	useAgentMotion(ref, mode, id);
	const artwork = <Artwork {...appearance} moving={mode === "working"} />;
	return (
		<svg
			ref={ref}
			role={label === undefined ? undefined : "img"}
			aria-label={label}
			aria-hidden={label === undefined ? "true" : undefined}
			viewBox="0 0 32 32"
			className={`agent-mark shrink-0 ${className}`}
			data-background={background}
			data-agent-kind={appearance.kind}
			data-state={mode}
		>
			{appearance.kind === "trellis" && background && <rect className="agent-ground" width="32" height="32" rx="7" />}
			<g className="agent-static">
				<Artwork {...appearance} />
			</g>
			{mode !== "static" && (
				<g className="agent-effect">
					{mode === "working" && artwork}
					<Glimmer id={id}>{artwork}</Glimmer>
				</g>
			)}
			{mode !== "static" && <circle className="agent-work-dot" cx="28" cy="4" r="2" />}
		</svg>
	);
}
