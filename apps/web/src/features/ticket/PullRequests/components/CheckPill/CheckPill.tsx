import type { Check } from "@trellis/api";
import { cx } from "@trellis/ui";
import { Check as CheckMark, Circle, X } from "lucide-react";
import { Fragment } from "react";

export type CheckPillProps = {
	checks: readonly Check[];
};

const tones = {
	fail: "bg-danger-soft text-danger",
	pending: "bg-warning-soft text-warning",
	pass: "bg-success-soft text-success",
	none: "bg-bg text-fg-muted",
};

const icon = "inline-flex size-2.75 shrink-0 *:size-full";

// The check counts: passing, failing, pending, each with its mark. Red
// when any fails, amber when any is pending, green when every check
// passed, grey with "No checks" otherwise.
export function CheckPill({ checks }: CheckPillProps) {
	const pass = checks.filter((check) => check.bucket === "pass").length;
	const fail = checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").length;
	const pending = checks.filter((check) => check.bucket === "pending").length;
	const tone = fail > 0 ? "fail" : pending > 0 ? "pending" : pass > 0 ? "pass" : "none";
	const groups = [
		{ count: pass, mark: <CheckMark strokeWidth={3} /> },
		{ count: fail, mark: <X strokeWidth={3} /> },
		{ count: pending, mark: <Circle strokeWidth={3} /> },
	].filter((group) => group.count > 0);
	return (
		<span
			className={cx(
				"inline-flex h-5 shrink-0 items-center gap-1 rounded-xl px-1.75 text-xs font-medium whitespace-nowrap tabular",
				tones[tone],
			)}
		>
			{groups.length === 0 && "No checks"}
			{groups.map((group, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the groups keep one order
				<Fragment key={index}>
					{index > 0 && " · "}
					<span aria-hidden="true" className={icon}>
						{group.mark}
					</span>
					{group.count}
				</Fragment>
			))}
		</span>
	);
}
