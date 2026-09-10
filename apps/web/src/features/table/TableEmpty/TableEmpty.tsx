export type TableEmptyProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	// True when a filter narrows the list; false when the project holds no ticket.
	filtered: boolean;
	// The search text of the view, when set.
	q?: string;
	// Opens the composer.
	onCreate?: () => void;
};

// Skeleton for the web-table work item. The tests beside it state the outcomes.
export function TableEmpty(_props: TableEmptyProps) {
	return null;
}
