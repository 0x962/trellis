import { createHash } from "node:crypto";
import type { GroupDeadlineV1 } from "../../../langflowContracts";
import { earliestDeadline } from "../earliestDeadline";

export function timeWarning(input: {
	executionId: string;
	attemptId: string;
	deadlines: readonly GroupDeadlineV1[];
	now: Date;
	acknowledgedMessageIds: readonly string[];
}) {
	if (!input.acknowledgedMessageIds.includes(input.attemptId)) return null;
	const deadline = earliestDeadline(input.deadlines);
	if (deadline === null) return null;
	const left = Date.parse(deadline.deadlineAt!) - input.now.getTime();
	if (left <= 0 || left > deadline.budgetMs / 2) return null;
	const threshold = left <= deadline.budgetMs / 4 ? ("quarter" as const) : ("half" as const);
	const messageId = createHash("sha256")
		.update(
			JSON.stringify(["langflow-time-warning-v1", input.executionId, input.attemptId, deadline.deadlineId, threshold]),
		)
		.digest("hex");
	if (input.acknowledgedMessageIds.includes(messageId)) return null;
	return {
		messageId,
		deadlineId: deadline.deadlineId,
		deadlineAt: deadline.deadlineAt!,
		threshold,
		attemptId: input.attemptId,
		text: `Time check: group ${deadline.groupOccurrenceKey} has reached its ${threshold}-time warning. The deadline is ${deadline.deadlineAt}. Trellis stops this process at that time. Finish now and write your result.`,
	};
}
