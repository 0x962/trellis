import { useId, useRef } from "react";
import { PersonaArtwork } from "./components/PersonaArtwork";
import { PersonaGlimmer } from "./components/PersonaGlimmer";
import { type PersonaKind, type PersonaState, personaAppearance } from "./personaAppearance";
import { usePersonaMotion } from "./usePersonaMotion";

export function PersonaMark({
	name,
	kind,
	state = "static",
}: {
	name: string;
	kind?: PersonaKind;
	state?: PersonaState;
}) {
	const appearance = personaAppearance(name, kind);
	const mode = state === "working" && appearance.kind !== "manager" ? "working-mild" : state;
	const id = useId();
	const ref = useRef<SVGSVGElement>(null);
	usePersonaMotion(ref, mode, id);
	const artwork = <PersonaArtwork {...appearance} moving={mode === "working"} />;
	return (
		<svg
			ref={ref}
			aria-hidden="true"
			viewBox="0 0 32 32"
			className="persona-mark size-full"
			data-persona-kind={appearance.kind}
			data-state={mode}
		>
			{appearance.kind === "manager" && <rect className="persona-ground" width="32" height="32" rx="7" />}
			<g className="persona-static">
				<PersonaArtwork {...appearance} />
			</g>
			{mode !== "static" && (
				<g className="persona-effect">
					{mode === "working" && artwork}
					<PersonaGlimmer id={id}>{artwork}</PersonaGlimmer>
				</g>
			)}
			{mode !== "static" && <circle className="persona-work-dot" cx="28" cy="4" r="2" />}
		</svg>
	);
}
