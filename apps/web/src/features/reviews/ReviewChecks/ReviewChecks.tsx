import type { ReviewRevision } from "@trellis/api";
import { type CheckStatus, ChecksLine, type ChecksLineBucket, type ChecksLineCheck } from "@trellis/ui/review";
import { useMemo } from "react";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { type CheckGroupKey, checkGroups, type ReviewCheck } from "./checkGroups";

const collapsedDefaults = ["neutral", "success", "skipped"];
const bucketOfGroup: Record<CheckGroupKey, ChecksLineBucket> = {
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
	const rollup = revision?.meta.statusCheckRollup as ReviewCheck[] | undefined;
	const checks = useMemo<ChecksLineCheck[]>(
		() =>
			checkGroups(rollup ?? []).flatMap((group) =>
				group.checks.map((check) => ({
					key: check.key,
					name: check.name,
					workflow: check.workflowName ?? null,
					bucket: bucketOfGroup[group.key],
					link: check.detailsUrl || check.targetUrl || null,
					status: statuses[group.key],
				})),
			),
		[rollup],
	);
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, collapsedDefaults);
	return <ChecksLine checks={checks} loading={revision === null} isCollapsed={isCollapsed} onToggle={toggle} />;
}
