import type { GroupDeadlineV1, NativeLaunchReceiptV1 } from "../../../langflowContracts";

export function startDeadline(
	deadline: GroupDeadlineV1,
	launch: NativeLaunchReceiptV1,
): Extract<GroupDeadlineV1, { launchedAt: string }> {
	if (deadline.launchedAt !== null) return deadline;
	return {
		...deadline,
		launchedAt: launch.launchedAt,
		deadlineAt: new Date(Date.parse(launch.launchedAt) + deadline.budgetMs).toISOString(),
		launchReceiptId: launch.launchReceiptId,
	};
}
