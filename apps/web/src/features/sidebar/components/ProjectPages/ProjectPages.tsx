import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";

// A page reads as its name alone, and its padding puts that name one step
// in from the name of the project above it.
const indent = ["pl-4", "pl-7", "pl-10", "pl-13", "pl-16"] as const;

export function ProjectPages({
	project,
	depth,
	pathname,
}: {
	project: ProjectSummary;
	depth: number;
	pathname: string;
}) {
	const current = projectRefOfPathname(pathname) === project.path;
	const manager = pathname.endsWith("/settings/manager");
	const settings = pathname.endsWith("/settings");
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
								<span className="sidebar-label">{label}</span>
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</li>
	);
}
