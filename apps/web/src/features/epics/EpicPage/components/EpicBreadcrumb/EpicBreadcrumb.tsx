import { Link } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { ProjectBreadcrumb } from "../../../../shell/ProjectBreadcrumb";

export function EpicBreadcrumb({ project }: { project: Project }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<ProjectBreadcrumb project={project} />
			<span aria-hidden="true" className="text-fg-faint">
				/
			</span>
			<Link
				to="/p/$"
				params={{ _splat: `${project.key}/epics` }}
				search={{}}
				className="inline-flex h-7 max-md:h-11 pointer-coarse:h-11 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				Epics
			</Link>
		</span>
	);
}
