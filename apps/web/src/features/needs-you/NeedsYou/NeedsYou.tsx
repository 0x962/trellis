import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";

export function NeedsYou() {
	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col" />
		</>
	);
}
