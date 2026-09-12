import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";

// The archived projects under the project tree, in one group that starts
// collapsed. The group shows only when the server holds an archived project.
// Each row sits on the tree's grid at the first level, and reads faint.
export function ArchivedProjects() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } }));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const [open, setOpen] = useState(false);
	if (data === undefined || data.length === 0) return null;
	return (
		<nav aria-label="Archived projects" className="pt-3">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex h-8 pointer-coarse:h-11 w-full items-center gap-2 rounded-md pr-2 pl-2 text-xs font-medium text-fg-faint transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span aria-hidden="true" className="inline-flex w-7 justify-center *:size-3">
					{open ? <CaretDown /> : <CaretRight />}
				</span>
				<span>Archived</span>
				<span className="ml-auto tabular">{formatCount(data.length)}</span>
			</button>
			{open && (
				<ul className="flex flex-col gap-0.5">
					{data.flatMap((project) => [
						<TreeRow key={project.id} project={project} depth={0} archived />,
						<ProjectPages key={`${project.id}.pages`} project={project} depth={1} pathname={pathname} />,
					])}
				</ul>
			)}
		</nav>
	);
}
