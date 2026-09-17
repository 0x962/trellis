import { boxLines, type PersonaKind, trellisLines } from "../../personaAppearance";

export function PersonaArtwork({
	kind,
	letters,
	moving = false,
}: {
	kind: PersonaKind;
	letters: string;
	moving?: boolean;
}) {
	return (
		<g className={moving ? "persona-rotor" : undefined}>
			<g transform={kind === "reviewer" ? "rotate(45 16 16)" : undefined}>
				{(kind === "manager" ? trellisLines : boxLines).map((d, index) => (
					<path key={d} d={d} data-piece={moving ? index : undefined} />
				))}
			</g>
			{kind !== "manager" && (
				<text x="16" y="16">
					{letters}
				</text>
			)}
		</g>
	);
}
