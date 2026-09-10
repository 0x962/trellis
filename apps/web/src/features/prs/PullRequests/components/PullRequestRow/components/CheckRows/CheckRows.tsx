import type { Check, CheckBucket } from "@trellis/api";
import { cx } from "@trellis/ui";
import { sortChecks } from "../../../../../utils/sortChecks";

export type CheckRowsProps = {
	checks: readonly Check[];
};

const labels: Record<CheckBucket, string> = {
	pass: "Passed",
	fail: "Failed",
	pending: "Pending",
	skipping: "Skipped",
	cancel: "Canceled",
};

const tones: Record<CheckBucket, string> = {
	pass: "text-success",
	fail: "text-danger",
	pending: "text-warning",
	skipping: "text-fg-muted",
	cancel: "text-danger",
};

// One row per check under an expanded pull request, failing checks first.
export function CheckRows({ checks }: CheckRowsProps) {
	return (
		<ul className="flex flex-col border-t border-border">
			{sortChecks(checks).map((check, index) => (
				// GitHub repeats a check name across workflows and re-runs, so the
				// position in the list is what a row stands for.
				// biome-ignore lint/suspicious/noArrayIndexKey: the position is the row's identity
				<li key={index} data-check-row="" className="flex h-8 items-center gap-3 px-3 text-sm">
					<span data-check-bucket="" className={cx("w-16 shrink-0 font-medium", tones[check.bucket])}>
						{labels[check.bucket]}
					</span>{" "}
					<span data-check-name="" className="min-w-0 flex-1 truncate text-fg">
						{check.name}
					</span>{" "}
					{check.workflow !== null && (
						<span data-check-workflow="" className="shrink-0 font-mono text-xs text-fg-muted">
							{check.workflow}
						</span>
					)}{" "}
					{check.link !== null && (
						<a
							href={check.link}
							target="_blank"
							rel="noopener noreferrer"
							className="relative inline-flex h-7 shrink-0 items-center px-2 text-fg-muted before:absolute before:inset-0 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:before:-inset-y-2"
						>
							Open
						</a>
					)}
				</li>
			))}
		</ul>
	);
}
