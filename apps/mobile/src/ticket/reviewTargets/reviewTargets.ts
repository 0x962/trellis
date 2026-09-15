import type { Status, StatusSummary } from "@trellis/api";
import { groupStatuses, lowestOf } from "../statusGroups";

// The status Approve moves a ticket to: the status after `current` in column
// order, which is category order and then position. A canceled status
// is never a target. Done follows every review status, so a review status
// always has a next status.
export const approveTarget = (statuses: readonly Status[], current: Pick<StatusSummary, "id">): Status => {
	const order = groupStatuses(statuses)
		.filter((group) => group.category !== "canceled")
		.flatMap((group) => group.statuses);
	return order[order.findIndex((status) => status.id === current.id) + 1]!;
};

// The status Send back moves a ticket to: the started status with the lowest position.
export const sendBackTarget = (statuses: readonly Status[]): Status => lowestOf(statuses, "started");

// Approve and Send back show only while a person is the reviewer.
export const showsReviewActions = (status: Pick<StatusSummary, "category" | "reviewer">): boolean =>
	status.category === "review" && status.reviewer === "human";
