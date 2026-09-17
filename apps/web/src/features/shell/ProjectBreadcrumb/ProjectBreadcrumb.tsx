import { Link } from "@tanstack/react-router";
import { Tooltip, TrellisMark } from "@trellis/ui";
import { projectSlashPath } from "../../../lib/projectPath";

export function ProjectBreadcrumb({ project }: { project: { path: string; name: string } }) {
	return (
		<Tooltip content={project.name}>
			<Link
				to="/p/$"
				params={{ _splat: projectSlashPath(project.path) }}
				search={{}}
				aria-label={project.name}
				className="inline-flex size-7 align-middle items-center justify-center max-md:size-11 pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<TrellisMark className="size-6" />
			</Link>
		</Tooltip>
	);
}
