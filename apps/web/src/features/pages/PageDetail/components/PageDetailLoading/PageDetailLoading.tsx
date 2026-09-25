import { Spinner } from "@trellis/ui";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";

export function PageDetailLoading() {
	return (
		<>
			<Topbar>
				<PageTitle title="Pages" />
			</Topbar>
			<div className="page-card flex flex-1 items-center justify-center overflow-hidden" role="status">
				<Spinner />
				<span className="sr-only">Load Page</span>
			</div>
		</>
	);
}
