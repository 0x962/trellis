import type { ReviewRevision } from "@trellis/api";
import { CheckRing } from "@trellis/ui";
import { CheckResults } from "@trellis/ui/review";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { checkDuration, checkGroupOrder, checkGroups, checkLabel, checkSummary, type ReviewCheck } from "./checkGroups";

const collapsedDefaults = checkGroupOrder.filter((group) => !group.expanded).map((group) => group.key);

export function ReviewChecks({ revision, pr }: { revision: ReviewRevision | null; pr: string }) {
	const checks = (revision?.meta.statusCheckRollup ?? []) as ReviewCheck[];
	const summary = checkSummary(checks);
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, collapsedDefaults);
	return (
		<CheckResults
			title={summary.title}
			description={summary.description}
			loading={revision === null}
			summary={<CheckRing counts={summary.counts} />}
			groups={checkGroups(checks).map((group) => ({
				key: group.key,
				label: group.label,
				checks: group.checks.map((check) => ({
					key: check.key,
					name: check.name,
					status: group.key,
					label: checkLabel(check),
					workflow: check.workflowName,
					url: check.detailsUrl || check.targetUrl || undefined,
					duration: checkDuration(check),
				})),
			}))}
			isCollapsed={isCollapsed}
			onToggle={toggle}
		/>
	);
}
