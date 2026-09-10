import type { ReactElement, ReactNode } from "react";

export type SectionHeaderProps = {
	name: string;
	count: number;
	// The mark before the name.
	icon?: ReactNode;
	// The muted text on the right: the swipe hint, the section's rule, or
	// Show and Hide for a collapsible section.
	hint?: string;
	open: boolean;
	onToggle: () => void;
};

// The header of one Needs you section. The whole row is the button that
// opens and closes the section.
export function SectionHeader(_props: SectionHeaderProps): ReactElement {
	throw new Error("mobile-inbox: SectionHeader is not implemented");
}
