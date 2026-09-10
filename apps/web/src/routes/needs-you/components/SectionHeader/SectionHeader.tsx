import type { ReactElement, ReactNode } from "react";
import { formatCount } from "../../../../lib/format";

export type SectionHeaderProps = {
	name: string;
	count: number;
	// The mark before the name: a StatusIcon or a lucide icon.
	icon: ReactElement;
	// The muted text on the right: the keys, or the section's rule.
	hint?: ReactNode;
	open: boolean;
	onToggle: () => void;
};

// The 32 px header of a Needs you section. The whole row is the button
// that opens and closes the section.
export function SectionHeader({ name, count, icon, hint, open, onToggle }: SectionHeaderProps) {
	return (
		<button
			type="button"
			aria-expanded={open}
			onClick={onToggle}
			className="flex h-8 w-full items-center gap-2 border-y border-border bg-bg px-5 text-left font-medium text-fg transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
		>
			<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
				{icon}
			</span>
			{name}
			<span className="font-normal text-fg-faint tabular">{formatCount(count)}</span>
			{hint !== undefined && (
				<span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-fg-faint">{hint}</span>
			)}
		</button>
	);
}
