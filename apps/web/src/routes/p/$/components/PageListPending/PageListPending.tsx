import { PageListSkeleton } from "../../../../../features/pages/PageList/components/PageListSkeleton";
import { PageTitle } from "../../../../../features/shell/PageTitle";
import { Topbar } from "../../../../../features/shell/Topbar";

export function PageListPending() {
	return (
		<>
			<Topbar>
				<PageTitle title="Pages" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				<PageListSkeleton />
			</div>
		</>
	);
}
