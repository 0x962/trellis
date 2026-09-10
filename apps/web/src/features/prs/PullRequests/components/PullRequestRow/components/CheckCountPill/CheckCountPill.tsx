import type { Check } from "@trellis/api";
import { cx } from "@trellis/ui";
import { Check as CheckMark, CircleDashed, X } from "lucide-react";
import { tabularClass } from "../../../../../../../lib/format";
import { checkCounts } from "../../../../../utils/checkCounts";

export type CheckCountPillProps = {
	checks: readonly Check[];
};

type Tone = "danger" | "warning" | "success" | "muted";

const tones: Record<Tone, string> = {
	danger: "bg-danger-soft text-danger",
	warning: "bg-warning-soft text-warning",
	success: "bg-success-soft text-success",
	muted: "text-fg-faint",
};

const shell = "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-xl px-1.75 text-xs font-medium whitespace-nowrap";

// The pass, fail, and pending counts of one pull request. The tone follows
// the worst bucket in the list.
export function CheckCountPill({ checks }: CheckCountPillProps) {
	if (checks.length === 0) {
		return (
			<span data-check-pill="" data-tone="muted" className={cx(shell, tabularClass, tones.muted)}>
				No checks
			</span>
		);
	}
	const counts = checkCounts(checks);
	const tone: Tone = counts.fail > 0 ? "danger" : counts.pending > 0 ? "warning" : "success";
	return (
		<span
			data-check-pill=""
			data-tone={tone}
			role="img"
			aria-label={`${counts.pass} passed, ${counts.fail} failed, ${counts.pending} pending`}
			className={cx(shell, tabularClass, tones[tone])}
		>
			<span className="inline-flex items-center gap-0.5">
				<CheckMark className="size-2.75" aria-hidden={true} />
				{counts.pass}
			</span>{" "}
			<span className="inline-flex items-center gap-0.5">
				<X className="size-2.75" aria-hidden={true} />
				{counts.fail}
			</span>{" "}
			<span className="inline-flex items-center gap-0.5">
				<CircleDashed className="size-2.75" aria-hidden={true} />
				{counts.pending}
			</span>
		</span>
	);
}
