import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cx } from "@trellis/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { projectRefOfPathname, projectSlashPath } from "../../../lib/projectPath";
import { ProjectKey } from "../../shell/ProjectKey";

const ProjectRowActions = lazy(async () => ({ default: (await import("../ProjectRowActions")).ProjectRowActions }));

// The archived projects under the project tree, in one group that starts
// collapsed. The group shows only when the server holds an archived project.
export function ArchivedProjects() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } }));
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [open, setOpen] = useState(false);
	if (data === undefined || data.length === 0) return null;
	const activeRef = projectRefOfPathname(pathname);
	return (
		<nav aria-label="Archived projects" className="pt-3">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex h-7 w-full items-center gap-1 rounded-md pr-2 pl-1 text-xs tracking-wide text-fg-faint uppercase transition-colors duration-hover hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					{open ? <ChevronDown /> : <ChevronRight />}
				</span>
				<span>Archived</span>
				<span className="ml-auto tabular">{formatCount(data.length)}</span>
			</button>
			{open && (
				<ul className="flex flex-col gap-0.5">
					{data.map((project) => {
						const active = project.path === activeRef;
						return (
							<li key={project.id} className="relative">
								<Link
									to="/p/$"
									params={{ _splat: projectSlashPath(project.path) }}
									aria-current={active ? "page" : undefined}
									className={cx(
										"flex h-7 items-center gap-1.5 rounded-md pr-9 pl-2 transition-colors duration-hover hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
										active ? "bg-accent-soft text-fg" : "text-fg-faint",
									)}
								>
									<span aria-hidden="true" className="size-4 shrink-0" />
									{project.depth === 0 && <ProjectKey projectKey={project.key} />}
									<span className="truncate">{project.name}</span>
								</Link>
								<span className="absolute top-0 right-0 z-10">
									<Suspense fallback={null}>
										<ProjectRowActions project={project} />
									</Suspense>
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</nav>
	);
}
