import type { Check, CheckBucket } from "@trellis/api";
import { cx } from "@trellis/ui";
import { Check as CheckMark, Circle, Minus, X } from "lucide-react";
import type { ReactElement } from "react";

export type CheckRowsProps = {
	checks: readonly Check[];
};

const marks: Record<CheckBucket, { label: string; icon: ReactElement; className: string }> = {
	pass: { label: "Passing check", icon: <CheckMark strokeWidth={2.5} />, className: "text-success" },
	fail: { label: "Failing check", icon: <X strokeWidth={2.5} />, className: "text-danger" },
	cancel: { label: "Cancelled check", icon: <X strokeWidth={2.5} />, className: "text-danger" },
	pending: { label: "Pending check", icon: <Circle strokeWidth={2.5} />, className: "text-fg-faint" },
	skipping: { label: "Skipped check", icon: <Minus strokeWidth={2.5} />, className: "text-warning" },
};

const failed = (check: Check) => check.bucket === "fail" || check.bucket === "cancel";

// One 30 px line per check: the bucket mark, the name, the workflow, and
// the link to the run. A failing check is what a person came for, so the
// failures lead; the rest keep the run order.
export function CheckRows({ checks }: CheckRowsProps) {
	const ordered = [...checks.filter(failed), ...checks.filter((check) => !failed(check))];
	return (
		<ul aria-label="Checks" className="border-t border-border bg-bg">
			{ordered.map((check, index) => {
				const mark = marks[check.bucket];
				return (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: check names repeat across workflows
						key={index}
						className="flex h-7.5 items-center gap-2.5 border-t border-border pr-3 pl-10 text-sm first:border-t-0"
					>
						<span
							role="img"
							aria-label={mark.label}
							className={cx("inline-flex size-3.25 shrink-0 *:size-full", mark.className)}
						>
							{mark.icon}
						</span>
						<span className={cx("truncate", failed(check) ? "font-medium text-danger" : "text-fg")}>{check.name}</span>
						{check.workflow !== null && <span className="text-fg-faint">· {check.workflow}</span>}
						{check.link !== null && (
							<a
								href={check.link}
								target="_blank"
								rel="noopener noreferrer"
								className="ml-auto text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-accent"
							>
								Open
							</a>
						)}
					</li>
				);
			})}
		</ul>
	);
}
