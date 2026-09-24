import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useApp } from "../../../lib/appContext";
import { activeAgentCountOf } from "../../agents/activeAgents";
import { useActiveAgentCounts } from "../../agents/useActiveAgentCounts";
import { ArchivedGroup } from "../components/ArchivedGroup";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";
import { useProjectMore } from "../sidebarProjectMore";

export function ArchivedProjects() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } }));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const projectAgentCounts = useActiveAgentCounts();
	const isMoreOpenOf = useProjectMore(pathname);
	if (data === undefined || data.length === 0) return null;
	return (
		<ArchivedGroup label="Archived projects" count={data.length}>
			<ul className="sidebar-project-tree flex flex-col gap-0.5">
				{data.flatMap((project) => [
					<TreeRow key={project.id} project={project} archived />,
					<ProjectPages
						key={`${project.id}.pages`}
						project={project}
						pathname={pathname}
						activeAgentCount={activeAgentCountOf(projectAgentCounts, project.id)}
						moreOpen={isMoreOpenOf(project.id)}
					/>,
				])}
			</ul>
		</ArchivedGroup>
	);
}
