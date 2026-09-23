import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { activeAgentsOf, useActiveAgentCounts } from "../../sessions/activeAgents";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";

export function ArchivedProjects() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } }));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const [open, setOpen] = useState(false);
	const activeAgents = useActiveAgentCounts();
	if (data === undefined || data.length === 0) return null;
	return (
		<nav aria-label="Archived projects" className="pt-1">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="sidebar-row w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg active:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
					{open ? <CaretDown /> : <CaretRight />}
				</span>
				<span className="sidebar-label">Archived</span>
				<span className="sidebar-trailing text-fg-faint">{formatCount(data.length)}</span>
			</button>
			{open && (
				<ul className="sidebar-project-tree flex flex-col gap-0.5">
					{data.flatMap((project) => [
						<TreeRow key={project.id} project={project} depth={1} archived />,
						<ProjectPages
							key={`${project.id}.pages`}
							project={project}
							depth={2}
							pathname={pathname}
							activeAgents={activeAgentsOf(activeAgents, project.id)}
						/>,
					])}
				</ul>
			)}
		</nav>
	);
}
