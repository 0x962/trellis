import type { Status, StatusCategory } from "@trellis/api";

// The status with the smallest position in `category`, or undefined when
// the list holds none of that category. Approve, Send back, Mark Done, and
// "also mark In Progress" all move a ticket to this status.
export const lowestPositionStatus = (statuses: readonly Status[], category: StatusCategory) =>
	statuses
		.filter((status) => status.category === category)
		.reduce<Status | undefined>(
			(lowest, status) => (lowest === undefined || status.position < lowest.position ? status : lowest),
			undefined,
		);
