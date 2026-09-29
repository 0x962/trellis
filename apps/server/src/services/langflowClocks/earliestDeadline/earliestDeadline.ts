import type { GroupDeadlineV1 } from "../../../langflowContracts";

export function earliestDeadline(deadlines: readonly GroupDeadlineV1[]) {
	let earliest: GroupDeadlineV1 | null = null;
	for (const deadline of deadlines) {
		if (deadline.deadlineAt === null) continue;
		if (earliest === null || Date.parse(deadline.deadlineAt) < Date.parse(earliest.deadlineAt!)) earliest = deadline;
	}
	return earliest;
}
