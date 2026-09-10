import type { ListQueryInput, Sort, StatusCategory } from "@trellis/api";

// The three filters of the segmented control. Together they cover every
// status category once, so a ticket sits under exactly one segment.
export type Segment = "active" | "review" | "done";

// The two orders of the sort toggle.
export type SortValue = "updated" | "priority";

// The rows one page holds. The number is fixed, so a cursor always pages
// through the same size.
export const pageLimit = 25;

export const categoryOf = (_segment: Segment): StatusCategory[] => {
	throw new Error("categoryOf is not built yet.");
};

export const sortOf = (_sort: SortValue): Sort => {
	throw new Error("sortOf is not built yet.");
};

export type ListQueryArgs = {
	// The canonical project path, such as CDE.web.
	project: string;
	segment: Segment;
	sort: SortValue;
	// The cursor of the page to read. The first page has none.
	cursor?: string;
};

export const listQueryInput = (_args: ListQueryArgs): ListQueryInput => {
	throw new Error("listQueryInput is not built yet.");
};
