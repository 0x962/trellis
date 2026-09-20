import type { CheckBucket, ReviewRevision } from "@trellis/api";
import type { CheckStatus } from "@trellis/ui/review";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { ChecksLine, type ChecksLineCheck } from "../ChecksLine";
import { type CheckGroupKey, checkGroups, type ReviewCheck } from "./checkGroups";

const collapsedDefaults = ["neutral", "success", "skipped"];
const buckets: Record<CheckGroupKey, CheckBucket> = {
	failed: "fail",
	running: "pending",
	pending: "pending",
	canceled: "cancel",
	success: "pass",
	skipped: "skipping",
	neutral: "skipping",
	unknown: "pending",
};
const statuses: Record<CheckGroupKey, CheckStatus> = {
	failed: "failed",
	running: "running",
	pending: "pending",
	canceled: "canceled",
	success: "success",
	skipped: "skipped",
	neutral: "neutral",
	unknown: "unknown",
};

export function ReviewChecks({ revision, pr }: { revision: ReviewRevision | null; pr: string }) {
	const rollup = (revision?.meta.statusCheckRollup ?? []) as ReviewCheck[];
	const checks: ChecksLineCheck[] = checkGroups(rollup).flatMap((group) =>
		group.checks.map((check) => ({
			name: check.name,
			workflow: check.workflowName ?? null,
			bucket: buckets[group.key],
			link: check.detailsUrl || check.targetUrl || null,
			status: statuses[group.key],
		})),
	);
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, collapsedDefaults);
	return <ChecksLine checks={checks} loading={revision === null} isCollapsed={isCollapsed} onToggle={toggle} />;
}
