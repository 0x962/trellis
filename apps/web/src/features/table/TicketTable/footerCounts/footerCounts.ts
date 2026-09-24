import type { View } from "../../../filters/grammar";
import type { TableData } from "../../hooks/useTableData";
import { closedCategories } from "../../hooks/useTableGroups";

export type FooterCounts = {
	total: number;
	// The Done and Canceled tickets that the groups of the view leave out.
	hidden: number;
};

// The two numbers of the table footer. The groups of the view hold the Done
// and the Canceled tickets under a grouping by status, and under any other
// grouping the rows are the open tickets alone. The server total counts the
// closed tickets either way, so the open count subtracts them.
export const footerCounts = (data: TableData, view: View): FooterCounts => {
	const closedVisible =
		data.closed !== null && ((view.group === "status" && view.closed !== "hide") || data.inlineClosed !== null);
	const closedTotal = closedVisible
		? closedCategories.reduce((sum, category) => sum + data.closed![category].count, 0)
		: 0;
	const loadedTotal = data.rows.length + closedTotal;
	const hidden = data.closed !== null && !closedVisible ? data.closed.done.count + data.closed.canceled.count : 0;
	return { total: data.allActiveLoaded ? loadedTotal : (data.total ?? loadedTotal) - hidden, hidden };
};
