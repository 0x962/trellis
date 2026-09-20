import type { Check, CheckBucket } from "@trellis/api";
import { type CheckResultGroup, CheckResults, type CheckStatus } from "@trellis/ui/review";
import { checkWords } from "./checkWords/checkWords";

export type ChecksLineCheck = Check & { status?: CheckStatus };

const groups: ReadonlyArray<{
	status: CheckStatus;
	label: string;
	word: string;
}> = [
	{ status: "failed", label: "Failed", word: "Failed" },
	{ status: "running", label: "In progress", word: "In progress" },
	{ status: "pending", label: "Pending", word: "Pending" },
	{ status: "canceled", label: "Canceled", word: "Canceled" },
	{ status: "unknown", label: "Unknown", word: "Unknown" },
	{ status: "neutral", label: "Neutral", word: "Neutral" },
	{ status: "success", label: "Passed", word: "Passed" },
	{ status: "skipped", label: "Skipped", word: "Skipped" },
];

const statusForBucket: Record<CheckBucket, CheckStatus> = {
	fail: "failed",
	pending: "pending",
	cancel: "canceled",
	pass: "success",
	skipping: "skipped",
};

export function ChecksLine({
	checks,
	loading = false,
	isCollapsed,
	onToggle,
}: {
	checks: readonly ChecksLineCheck[];
	loading?: boolean;
	isCollapsed: (key: CheckStatus) => boolean;
	onToggle: (key: CheckStatus) => void;
}) {
	const resultGroups: CheckResultGroup[] = groups.flatMap((group) => {
		const members = checks.filter((check) => (check.status ?? statusForBucket[check.bucket]) === group.status);
		if (members.length === 0) return [];
		return [
			{
				key: group.status,
				label: group.label,
				checks: members.map((check, index) => ({
					key: `${check.bucket}:${check.workflow ?? ""}:${check.name}:${index}`,
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
			groups={resultGroups}
			loading={loading}
			isCollapsed={isCollapsed}
			onToggle={onToggle}
		/>
	);
}
