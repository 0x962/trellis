import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { List, Settings } from "lucide-react";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";

// A page carries no chevron, so its padding adds that 20 px column to the
// padding of the project row above it. The icon of a page then starts in
// the same column as the icon of a sub-project at the same level.
const indent = ["pl-6", "pl-10", "pl-14", "pl-18", "pl-22"] as const;

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
	const settings = pathname.endsWith("/settings");
	return (
		<li>
			<nav aria-label={`${project.name} pages`}>
				<ul className="flex flex-col gap-0.5">
					{[
						{ label: "Tickets", suffix: "", icon: List, active: current && !settings },
						{ label: "Settings", suffix: "/settings", icon: Settings, active: current && settings },
					].map(({ label, suffix, icon: Icon, active }) => (
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
								<span className="sidebar-leading">
									<Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
								</span>
								<span className="sidebar-label">{label}</span>
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</li>
	);
}
