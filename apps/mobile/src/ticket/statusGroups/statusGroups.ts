import type { Status, StatusCategory } from "@trellis/api";

// The order the status sheet shows the categories in.
export const groupOrder: readonly StatusCategory[] = ["todo", "started", "review", "done", "canceled"];

// One heading in the status sheet and the statuses under it, by position.
export type StatusGroup = {
	category: StatusCategory;
	statuses: Status[];
};

// The effective statuses of a project, grouped by category in `groupOrder`.
// A category without a status has no group.
export const groupStatuses = (_statuses: readonly Status[]): StatusGroup[] => {
	throw new Error("groupStatuses is not implemented");
};
