import type { PersonaKind } from "@trellis/api";
import { BriefcaseBusiness, Hammer, ScanSearch } from "lucide-react";

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
		icon: ScanSearch,
	},
	{
		value: "manager",
		label: "Manager",
		plural: "Managers",
		description: "Coordinate agents and move work forward.",
		icon: BriefcaseBusiness,
	},
] satisfies Array<{ value: PersonaKind; label: string; plural: string; description: string; icon: typeof Hammer }>;
