import type { Status, StatusCategory } from "@trellis/api";

// The order the status sheet shows the categories in.
export const groupOrder: readonly StatusCategory[] = ["todo", "started", "review", "done", "canceled"];

// The heading text of each category in the status sheet.
export const groupLabels: Record<StatusCategory, string> = {
	todo: "Todo",
	started: "Started",
	review: "Review",
	done: "Done",
	canceled: "Canceled",
};

// One heading in the status sheet and the statuses under it, by position.
export type StatusGroup = {
	category: StatusCategory;
	statuses: Status[];
};

// The status with the lowest position in one category. The set always holds
// the category the caller asks for: a root is seeded with every category.
export const lowestOf = (statuses: readonly Status[], category: StatusCategory): Status =>
	[...statuses].filter((status) => status.category === category).sort((a, b) => a.position - b.position)[0]!;

// The effective statuses of a project, grouped by category in `groupOrder`.
// A category without a status has no group.
export const groupStatuses = (statuses: readonly Status[]): StatusGroup[] =>
	groupOrder
		.map((category) => ({
			category,
			statuses: statuses.filter((status) => status.category === category).sort((a, b) => a.position - b.position),
		}))
		.filter((group) => group.statuses.length > 0);
