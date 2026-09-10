import type { Status, StatusSummary } from "@trellis/api";

// The status Approve moves a ticket to: the done status with the lowest position.
export const approveTarget = (_statuses: readonly Status[]): Status => {
	throw new Error("approveTarget is not implemented");
};

// The status Send back moves a ticket to: the started status with the lowest position.
export const sendBackTarget = (_statuses: readonly Status[]): Status => {
	throw new Error("sendBackTarget is not implemented");
};

// Approve and Send back show only while a person is the reviewer.
export const showsReviewActions = (_status: Pick<StatusSummary, "category" | "reviewer">): boolean => {
	throw new Error("showsReviewActions is not implemented");
};
