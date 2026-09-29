import { ArrowClockwise, Plus, X } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { IconButton, Tooltip } from "@trellis/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { useFlowProjects } from "../FlowProjectSelect";
import { FlowDiscoveryContent } from "./components/FlowDiscoveryContent";
import { FlowDiscoveryFilters } from "./components/FlowDiscoveryFilters";
import { NewFlowDialog } from "./components/NewFlowDialog";
import { discoveryPosition } from "./discoveryPosition";
import type { FlowDiscoveryFilters as Filters } from "./flowDiscovery";
import { useFlowDiscovery } from "./useFlowDiscovery";

export function FlowsPage() {
	const navigate = useNavigate();
	const discovery = useFlowDiscovery();
	const projects = useFlowProjects();
	const [creating, setCreating] = useState(false);
	const [filters, setFilters] = useState(() => discoveryPosition.readFilters(sessionStorage));
	const scroll = useRef<HTMLDivElement>(null);
	const restored = useRef(false);
	useLayoutEffect(() => {
		if (discovery.load.state !== "loaded" || restored.current || !scroll.current) return;
		scroll.current.scrollTop = discoveryPosition.readScroll(sessionStorage);
		restored.current = true;
	}, [discovery.load.state]);
	const changeFilters = (next: Filters) => {
		discoveryPosition.writeFilters(sessionStorage, next);
		setFilters(next);
		if (scroll.current) scroll.current.scrollTop = 0;
	};

	return (
		<>
			<Topbar
				actions={
					<Tooltip content="New flow">
						<TopbarActionButton label="New flow" icon={<Plus />} onClick={() => setCreating(true)} />
					</Tooltip>
				}
			>
				<PageTitle title="Flows" />
			</Topbar>
			<FlowDiscoveryFilters filters={filters} projects={projects.data ?? []} onChange={changeFilters} />
			<div
				ref={scroll}
				className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4"
				onScroll={(event) => {
					if (restored.current) discoveryPosition.writeScroll(sessionStorage, event.currentTarget.scrollTop);
				}}
			>
				<div className="flex max-w-7xl flex-col gap-6">
					<FlowDiscoveryContent
						input={{
							filters,
							load: discovery.load,
							engine: { state: "unknown", reason: "The server has not reported flow engine availability." },
						}}
						retryAction={
							<Tooltip content="Retry">
								<IconButton
									label="Retry"
									icon={<ArrowClockwise />}
									disabled={discovery.refreshing}
									onClick={() => void discovery.refresh()}
								/>
							</Tooltip>
						}
						clearFiltersAction={
							<Tooltip content="Clear filters">
								<IconButton
									label="Clear filters"
									icon={<X />}
									onClick={() => changeFilters({ query: "", project: null })}
								/>
							</Tooltip>
						}
					/>
				</div>
			</div>
			{creating && (
				<NewFlowDialog
					onClose={() => setCreating(false)}
					onCreated={(flow) => void navigate({ to: "/ai/flows/$slug", params: { slug: flow.slug } })}
				/>
			)}
		</>
	);
}
