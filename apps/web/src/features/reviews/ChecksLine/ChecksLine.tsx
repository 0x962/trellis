import type { Check, CheckBucket } from "@trellis/api";
import { type CheckResultGroup, CheckResults, type CheckStatus } from "@trellis/ui/review";
import { checkWords } from "./checkWords/checkWords";

const groups: ReadonlyArray<{
	bucket: CheckBucket;
	status: CheckStatus;
	label: string;
	word: string;
}> = [
	{ bucket: "fail", status: "failed", label: "Failed", word: "Failed" },
	{ bucket: "pending", status: "pending", label: "Pending", word: "Pending" },
	{ bucket: "cancel", status: "canceled", label: "Canceled", word: "Canceled" },
	{ bucket: "pass", status: "success", label: "Passed", word: "Passed" },
	{ bucket: "skipping", status: "skipped", label: "Skipped", word: "Skipped" },
];

export function ChecksLine({
	checks,
	loading = false,
	isCollapsed,
	onToggle,
}: {
	checks: readonly Check[];
	loading?: boolean;
	isCollapsed: (key: CheckStatus) => boolean;
	onToggle: (key: CheckStatus) => void;
}) {
	const resultGroups: CheckResultGroup[] = groups.flatMap((group) => {
		const members = checks.filter((check) => check.bucket === group.bucket);
		if (members.length === 0) return [];
		return [
			{
				key: group.status,
				label: group.label,
				checks: members.map((check, index) => ({
					key: `${group.bucket}:${check.workflow ?? ""}:${check.name}:${index}`,
					name: check.name,
					status: group.status,
					label: group.word,
					workflow: check.workflow ?? undefined,
					url: check.link ?? undefined,
					duration: null,
				})),
			},
		];
	});
	return (
		<CheckResults
			title={checkWords(checks)}
			description=""
			groups={resultGroups}
			loading={loading}
			isCollapsed={isCollapsed}
			onToggle={onToggle}
		/>
	);
}
