import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";

export type BadgeTone = "ok" | "bad" | "wait" | "agent" | "accent" | "neutral";

export type BadgeProps = {
	tone?: BadgeTone;
	// A lucide icon element, shown at 11 px before the text.
	icon?: ReactElement;
	// md is 20 px. sm is the 18 px pill of a count in a nav row.
	size?: "sm" | "md";
	children: ReactNode;
	className?: string;
};

const tones: Record<BadgeTone, string> = {
	ok: "bg-success-soft text-success px-1.75",
	bad: "bg-danger-soft text-danger px-1.75",
	wait: "bg-warning-soft text-warning px-1.75",
	agent: "bg-accent-soft text-accent px-1.75",
	accent: "bg-accent-soft text-accent px-1.75",
	neutral: "text-fg-faint",
};

const sizes = { md: "h-5 font-medium", sm: "h-4.5 font-semibold" } as const;

// A count or a state word. The soft tones are pills; neutral is bare text.
export function Badge({ tone = "neutral", size = "md", icon, children, className }: BadgeProps) {
	return (
		<span
			className={cx(
				"inline-flex shrink-0 items-center gap-1 rounded-xl text-xs whitespace-nowrap tabular",
				sizes[size],
				tones[tone],
				className,
			)}
		>
			{icon && (
				<span aria-hidden="true" className="inline-flex size-2.75 shrink-0 *:size-full">
					{icon}
				</span>
			)}
			{children}
		</span>
	);
}
