import { Link } from "@tanstack/react-router";
import { cx, Tooltip, TrellisMark } from "@trellis/ui";
import { projectSlashPath } from "../../../lib/projectPath";

export function ProjectBreadcrumb({
	project,
	showName = false,
}: {
	project: { path: string; name: string };
	showName?: boolean;
}) {
	return (
		<Tooltip content={project.name}>
			<Link
				to="/p/$"
				params={{ _splat: projectSlashPath(project.path) }}
				search={{}}
				aria-label={project.name}
				className={cx(
					"inline-flex h-7 align-middle items-center gap-2 max-md:h-11 pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					showName ? "max-w-40" : "w-7 justify-center max-md:w-11 pointer-coarse:w-11",
				)}
			>
				<TrellisMark className="size-6 shrink-0" />
				{showName && <span className="truncate text-sm font-medium">{project.name}</span>}
			</Link>
		</Tooltip>
	);
}
