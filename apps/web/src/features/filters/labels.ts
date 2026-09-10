import type { Sort } from "@trellis/api";

const fields: Record<string, string> = {
	updatedAt: "updated",
	createdAt: "created",
	priority: "priority",
	number: "number",
	status: "status",
	position: "position",
};

// The footer text for a sort: "Sorted by updated", "Sorted by priority, ascending".
export const sortLabel = (sort: Sort): string => {
	const ascending = !sort.startsWith("-");
	const field = fields[sort.replace(/^-/, "")]!;
	return `Sorted by ${field}${ascending && field !== "priority" ? ", oldest first" : ""}`;
};

const filterKeys = [
	"status",
	"category",
	"reviewer",
	"priority",
	"parent",
	"pr",
	"ci",
	"actor",
	"q",
	"updated",
	"created",
	"completed",
] as const;

// True when the URL narrows the list beyond the scope.
export const hasFilters = (search: Record<string, unknown>): boolean =>
	filterKeys.some((key) => search[key] !== undefined);
