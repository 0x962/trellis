import type { Status, StatusSummary } from "@trellis/api";
import { lowestOf } from "../statusGroups";

// The status Approve moves a ticket to: the done status with the lowest position.
export const approveTarget = (statuses: readonly Status[]): Status => lowestOf(statuses, "done");

// The status Send back moves a ticket to: the started status with the lowest position.
export const sendBackTarget = (statuses: readonly Status[]): Status => lowestOf(statuses, "started");

// Approve and Send back show only while a person is the reviewer.
export const showsReviewActions = (status: Pick<StatusSummary, "category" | "reviewer">): boolean =>
	status.category === "review" && status.reviewer === "human";
