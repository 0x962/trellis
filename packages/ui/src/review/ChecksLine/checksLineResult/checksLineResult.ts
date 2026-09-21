import type { CheckResultGroup } from "../../CheckResults";
import type { CheckStatus } from "../../CheckStatusIcon";
import { checkDuration } from "../checkDuration";
import { type ChecksLineCheck, checkDisplay, checkWords, displayOf } from "../checkWords/checkWords";

const summaryStatus = (counts: Map<CheckStatus, number>): CheckStatus => {
	if ((counts.get("failed") ?? 0) > 0 || (counts.get("canceled") ?? 0) > 0) return "failed";
	if ((counts.get("running") ?? 0) > 0 || (counts.get("pending") ?? 0) > 0) return "running";
	if ((counts.get("unknown") ?? 0) > 0) return "unknown";
	if ((counts.get("success") ?? 0) > 0) return "success";
	if ((counts.get("skipped") ?? 0) > 0 || (counts.get("neutral") ?? 0) > 0) return "skipped";
	return "unknown";
};

const summaryTitle = (status: CheckStatus) => {
	if (status === "failed") return "Some checks were not successful";
	if (status === "running") return "Some checks are in progress";
	if (status === "success") return "All checks have passed";
	if (status === "skipped") return "Checks were skipped";
	return "Checks need attention";
};

const outcomeText = (outcome: string, duration: string) => {
	if (duration === "") return outcome;
	if (outcome === "Successful") return `${outcome} in ${duration}`;
	return `${outcome} after ${duration}`;
};

export function checksLineResult(checks: readonly ChecksLineCheck[]) {
	const checksByStatus = new Map<(typeof checkDisplay)[number]["status"], ChecksLineCheck[]>();
	for (const check of checks) {
		const status = displayOf(check).status;
		const bucketChecks = checksByStatus.get(status) ?? [];
		bucketChecks.push(check);
		checksByStatus.set(status, bucketChecks);
	}
	const counts = new Map<CheckStatus, number>();
	const groups: CheckResultGroup[] = checkDisplay.flatMap((display) => {
		const bucketChecks = checksByStatus.get(display.status) ?? [];
		if (bucketChecks.length === 0) return [];
		counts.set(display.status, bucketChecks.length);
		const occurrences = new Map<string, number>();
		return [
			{
				key: display.status,
				label: display.label,
				checks: bucketChecks.map((check) => {
					const identity = `${check.bucket}:${check.workflow ?? ""}:${check.name}`;
					const occurrence = occurrences.get(identity) ?? 0;
					occurrences.set(identity, occurrence + 1);
					const duration = checkDuration(check.startedAt ?? null, check.endedAt ?? null);
					return {
						key: check.key ?? `${identity}:${occurrence}`,
						name: check.name,
						status: display.status,
						workflow: check.workflow ?? undefined,
						url: check.link ?? undefined,
						outcome: outcomeText(display.outcome, duration),
						required: check.required,
					};
				}),
			},
		];
	});
	const status = summaryStatus(counts);
	return { groups, summaryStatus: status, title: summaryTitle(status), description: checkWords(checks) };
}
