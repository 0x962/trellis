import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";

// A page reads as its name alone, and its padding puts that name one step
// in from the name of the project above it.
const indent = ["pl-2", "pl-5", "pl-8", "pl-11", "pl-14"] as const;

export function ProjectPages({
	project,
	depth,
	pathname,
}: {
	project: ProjectSummary;
	depth: number;
	pathname: string;
}) {
	const { orpc } = useApp();
	const current = projectRefOfPathname(pathname) === project.path;
	const manager = pathname.endsWith("/settings/manager");
	const settings = pathname.endsWith("/settings");
	// The Manager link glimmers while the project's manager runs, so a person
	// sees at a glance which projects have one at work.
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: {} })).data;
	const managing =
		runs?.some((run) => run.kind === "manager" && run.state === "running" && run.projectId === project.id) ?? false;
	return (
		<li>
			<nav aria-label={`${project.name} pages`}>
				<ul className="flex flex-col gap-0.5">
					{[
						{ label: "Tickets", suffix: "", active: current && !settings && !manager },
						{ label: "Manager", suffix: "/settings/manager", active: current && manager },
						{ label: "Settings", suffix: "/settings", active: current && settings },
					].map(({ label, suffix, active }) => (
						<li key={label}>
							<Link
								to="/p/$"
								params={{ _splat: `${projectSlashPath(project.path)}${suffix}` }}
								activeOptions={{ exact: true, includeSearch: false }}
								aria-current={active ? "page" : undefined}
								className={cx(
									"sidebar-row text-sm text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									indent[Math.min(depth, indent.length - 1)],
									active && "sidebar-selected font-medium",
								)}
							>
								<span className={cx("sidebar-label", label === "Manager" && managing && "text-glimmer")}>{label}</span>
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</li>
	);
}
