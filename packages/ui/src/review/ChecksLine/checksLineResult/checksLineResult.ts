import type { CheckResultGroup } from "../../CheckResults";
import { checkDuration } from "../checkDuration";
import { type ChecksLineCheck, checkDisplay, checkWords, displayOf } from "../checkWords/checkWords";

export function checksLineResult(checks: readonly ChecksLineCheck[]) {
	const checksByStatus = new Map<(typeof checkDisplay)[number]["status"], ChecksLineCheck[]>();
	for (const check of checks) {
		const status = displayOf(check).status;
		const bucketChecks = checksByStatus.get(status) ?? [];
		bucketChecks.push(check);
		checksByStatus.set(status, bucketChecks);
	}
	const groups: CheckResultGroup[] = checkDisplay.flatMap((display) => {
		const bucketChecks = checksByStatus.get(display.status) ?? [];
		if (bucketChecks.length === 0) return [];
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
						duration: duration === "" ? undefined : duration,
					};
				}),
			},
		];
	});
	return { groups, title: checkWords(checks) };
}
