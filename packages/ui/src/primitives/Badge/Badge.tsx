import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";

export type BadgeTone = "ok" | "bad" | "wait" | "agent" | "accent" | "neutral";

export type BadgeProps = {
	tone?: BadgeTone;
	// A lucide icon element, shown at 11 px before the text.
	icon?: ReactElement;
	children: ReactNode;
	className?: string;
};

const tones: Record<BadgeTone, string> = {
	ok: "bg-success-soft text-success px-1.75",
	bad: "bg-danger-soft text-danger px-1.75",
	wait: "bg-warning-soft text-warning px-1.75",
	agent: "bg-agent-soft text-agent px-1.75",
	accent: "bg-accent-soft text-accent px-1.75",
	neutral: "text-fg-faint",
};

// A count or a state word. The soft tones are pills; neutral is bare text.
export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
	return (
		<span
			className={cx(
				"inline-flex h-5 shrink-0 items-center gap-1 rounded-xl text-xs font-medium whitespace-nowrap tabular",
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
