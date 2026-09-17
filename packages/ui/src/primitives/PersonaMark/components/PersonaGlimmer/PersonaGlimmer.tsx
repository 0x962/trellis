import type { ReactNode } from "react";

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

export function PersonaGlimmer({ id, children }: { id: string; children: ReactNode }) {
	return (
		<>
			<defs>
				<mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
					<g className="persona-mask">{children}</g>
				</mask>
				<linearGradient id={`${id}-film`} gradientUnits="userSpaceOnUse" x1="-30" y1="-12" x2="30" y2="12">
					{stops.map(([offset, color, opacity]) => (
						<stop key={offset} offset={offset} stopColor={`var(--film-${color})`} stopOpacity={opacity} />
					))}
				</linearGradient>
			</defs>
			<g className="persona-glimmer" mask={`url(#${id}-mask)`}>
				<rect className="persona-film" x="-90" y="-90" width="180" height="180" fill={`url(#${id}-film)`} />
			</g>
		</>
	);
}
