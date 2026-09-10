import { useState } from "react";

// The expanded pull requests of this browser tab. The list outlives one
// mount of the section, so a return to the ticket shows the rows the person
// opened. It does not outlive the tab.
const storageKey = "prs-expanded";

const stored = (): string[] => JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as string[];

// Whether one pull request row is open, and the toggle that opens or closes
// it and records the change for the tab.
export const useExpandedPr = (id: string) => {
	const [expanded, setExpanded] = useState(() => stored().includes(id));
	const toggle = () => {
		const rest = stored().filter((entry) => entry !== id);
		sessionStorage.setItem(storageKey, JSON.stringify(expanded ? rest : [...rest, id]));
		setExpanded(!expanded);
	};
	return { expanded, toggle };
};
