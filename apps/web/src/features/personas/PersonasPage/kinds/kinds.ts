import { Briefcase, Hammer, Scan } from "@phosphor-icons/react";
import type { PersonaKind } from "@trellis/api";

export const personaKinds = [
	{
		value: "builder",
		label: "Builder",
		plural: "Builders",
		description: "Build features and fix defects.",
		icon: Hammer,
	},
	{
		value: "reviewer",
		label: "Reviewer",
		plural: "Reviewers",
		description: "Review work and report findings.",
		icon: Scan,
	},
	{
		value: "manager",
		label: "Copilot",
		plural: "Copilots",
		description: "Coordinate agents and move work forward.",
		icon: Briefcase,
	},
] satisfies Array<{ value: PersonaKind; label: string; plural: string; description: string; icon: typeof Hammer }>;
