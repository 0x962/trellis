import type { CheckResultGroup } from "../../CheckResults";
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
					return {
						key: check.key ?? `${identity}:${occurrence}`,
						name: check.name,
						status: display.status,
						label: display.label,
						workflow: check.workflow ?? undefined,
						url: check.link ?? undefined,
						duration: null,
					};
				}),
			},
		];
	});
	return { groups, title: checkWords(checks) };
}
