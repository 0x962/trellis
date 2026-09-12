import { BoardSkeleton } from "../../board/components/BoardSkeleton";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { TableSkeleton } from "../TicketTable/components/TableSkeleton";

export type ListPendingProps = {
	view: "table" | "board";
	// The page title, when the route knows it before its data.
	title?: string;
};

// What a list route shows while its loader runs for more than 300 ms: the
// topbar, the 36 px filter bar, the rows or cards of the view, and the 28 px
// footer. Each part has the height of the real part, so the page replaces
// it with no shift.
export function ListPending({ view, title }: ListPendingProps) {
	return (
		<>
			<Topbar>{title !== undefined && <PageTitle title={title} />}</Topbar>
			<div aria-hidden="true" className="h-9 shrink-0 border-b border-border" />
			<div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
				{view === "table" ? <TableSkeleton density="comfortable" /> : <BoardSkeleton />}
			</div>
			<div aria-hidden="true" className="h-7 shrink-0 border-t border-border" />
		</>
	);
}
