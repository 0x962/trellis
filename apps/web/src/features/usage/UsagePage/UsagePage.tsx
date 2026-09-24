import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs } from "@trellis/ui";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { AgentUsage } from "./components/AgentUsage";
import { AgentUsageControls } from "./components/AgentUsageControls";
import { SystemUsage } from "./components/SystemUsage";

export function UsagePage() {
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const tab = search.tab ?? "agent";
	const setTab = (next: "agent" | "system") =>
		void navigate({
			search: (previous) => ({ ...previous, tab: next === "agent" ? undefined : next }),
			resetScroll: false,
		});

	return (
		<>
			{/* The System Usage tab uses no range, so the controls do not show on
			    that tab. */}
			<Topbar actions={tab === "agent" ? <AgentUsageControls /> : undefined}>
				<PageTitle title="Usage" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<Tabs
					value={tab}
					onValueChange={setTab}
					panelClassName="pt-5"
					items={[
						{ value: "agent", label: "Agent Usage", content: tab === "agent" ? <AgentUsage /> : null },
						{ value: "system", label: "System Usage", content: tab === "system" ? <SystemUsage /> : null },
					]}
				/>
			</div>
		</>
	);
}
