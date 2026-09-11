import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { List, Settings } from "lucide-react";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";

const indent = ["pl-2", "pl-7", "pl-12", "pl-17", "pl-22"] as const;

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
									"flex h-8 items-center pr-1 text-sm text-fg-muted transition-colors duration-hover hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11",
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
