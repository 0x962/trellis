import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";

// The home screen: the page title over an empty body.
export function NeedsYou() {
	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
			</Topbar>
			<div data-testid="needs-you-body" className="page-card min-h-0 flex-1" />
		</>
	);
}
