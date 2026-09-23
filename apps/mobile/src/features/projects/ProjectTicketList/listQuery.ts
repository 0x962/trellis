import { type ListQueryInput, ProjectRefSchema, type Sort, type StatusCategory } from "@trellis/api";

// The three filters of the segmented control. Together they cover every
// status category once, so a ticket sits under exactly one segment.
export type Segment = "active" | "review" | "done";

// The two orders of the sort toggle.
export type SortValue = "updated" | "priority";

// The rows one page holds. The number is fixed, so a cursor always pages
// through the same size.
export const pageLimit = 25;

const categories: Record<Segment, StatusCategory[]> = {
	active: ["todo", "started"],
	review: ["review"],
	done: ["done", "canceled"],
};

export const categoryOf = (segment: Segment): StatusCategory[] => categories[segment];

const sorts: Record<SortValue, Sort> = { updated: "-updatedAt", priority: "priority" };

export const sortOf = (sort: SortValue): Sort => sorts[sort];

export type ListQueryArgs = {
	// The canonical project ref, such as CDE.
	project: string;
	segment: Segment;
	sort: SortValue;
	// The cursor of the page to read. The first page has none.
	cursor?: string;
};

// The `tickets.list` input for one page. The project ref arrives from a
// route path, which a person can spell in any case, so it goes out in the
// one spelling the server prints.
export const listQueryInput = ({ project, segment, sort, cursor }: ListQueryArgs): ListQueryInput => ({
	project: ProjectRefSchema.canonicalize(project),
	category: categoryOf(segment),
	sort: sortOf(sort),
	limit: pageLimit,
	...(cursor === undefined ? {} : { cursor }),
});
