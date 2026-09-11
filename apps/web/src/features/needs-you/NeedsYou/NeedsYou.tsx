import { Topbar } from "../../shell/Topbar";

export function NeedsYou() {
	return (
		<>
			<Topbar>
				<h1 className="text-lg font-semibold text-fg">Needs you</h1>
			</Topbar>
			<div className="min-h-0 flex-1" />
		</>
	);
}
