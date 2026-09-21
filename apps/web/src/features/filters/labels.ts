import type { Sort } from "@trellis/api";

const fields: Record<string, string> = {
	updatedAt: "updated",
	createdAt: "created",
	priority: "priority",
	number: "ID",
	status: "status",
	position: "manual order",
};

export const sortLabel = (sort: Sort): string => {
	if (sort === "position") return "Manual order";
	const ascending = !sort.startsWith("-");
	const field = fields[sort.replace(/^-/, "")]!;
	const dated = field === "updated" || field === "created";
	return `Sorted by ${field}${ascending && dated ? ", oldest first" : ""}`;
};

export const filterKeys = [
	"status",
	"category",
	"reviewer",
	"priority",
	"label",
	"parent",
	"waitsOn",
	"blocked",
	"epic",
	"wave",
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
	filterKeys.some((key) => search[key] !== undefined) || search.project !== undefined;
