import type { Check, CheckBucket, ReviewRevision } from "@trellis/api";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { ChecksLine } from "../ChecksLine";
import { type CheckGroupKey, checkGroups, type ReviewCheck } from "./checkGroups";

const collapsedDefaults = ["success", "skipped"];
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

export function ReviewChecks({ revision, pr }: { revision: ReviewRevision | null; pr: string }) {
	const rollup = (revision?.meta.statusCheckRollup ?? []) as ReviewCheck[];
	const checks: Check[] = checkGroups(rollup).flatMap((group) =>
		group.checks.map((check) => ({
			name: check.name,
			workflow: check.workflowName ?? null,
			bucket: buckets[group.key],
			link: check.detailsUrl || check.targetUrl || null,
		})),
	);
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, collapsedDefaults);
	return <ChecksLine checks={checks} loading={revision === null} isCollapsed={isCollapsed} onToggle={toggle} />;
}
