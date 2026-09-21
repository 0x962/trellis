import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx, WorkingAgentText } from "@trellis/ui";
import { formatCount } from "../../../../lib/format";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";

const indent = ["pl-8", "pl-8", "pl-11", "pl-14", "pl-17"] as const;

export function ProjectPages({
	project,
	depth,
	pathname,
	epicWorkingCount = 0,
	sessionWorkingCount = 0,
}: {
	project: ProjectSummary;
	depth: number;
	pathname: string;
	epicWorkingCount?: number;
	sessionWorkingCount?: number;
}) {
	const current = projectRefOfPathname(pathname) === project.path;
	// The Tickets row owns the bare project path, so every other page of the
	// project turns it off. That includes the settings page and its /notes
	// section, which the project's row menu (ProjectRowActions) opens.
	const settings = pathname.endsWith("/settings") || pathname.endsWith("/notes");
	const diffs = pathname.endsWith("/diffs");
	// The epics list and the page of one epic, `/epics/<slug>`.
	const epics = pathname.endsWith("/epics") || pathname.includes("/epics/");
	const sessions = pathname.startsWith("/sessions/project/");
	const workingCounts = { Epics: epicWorkingCount, Sessions: sessionWorkingCount };
	return (
		<li>
			<nav aria-label={`${project.name} pages`}>
				<ul className="flex flex-col">
					{[
						{
							label: "Tickets",
							suffix: "",
							active: current && !settings && !diffs && !epics && !sessions,
							trailing: null,
						},
						{
							label: "Epics",
							suffix: "/epics",
							active: current && epics,
							// The count of open epics of this project alone.
							trailing: project.openEpicCount > 0 ? formatCount(project.openEpicCount) : null,
						},
						{ label: "Diffs", suffix: "/diffs", active: current && diffs, trailing: null },
						{ label: "Sessions", suffix: "/sessions", active: current && sessions, trailing: null },
					].map(({ label, suffix, active, trailing }) => (
						<li key={label}>
							<Link
								data-project-page=""
								to={suffix === "/sessions" ? "/sessions/project/$project" : "/p/$"}
								params={
									suffix === "/sessions"
										? { project: project.path }
										: { _splat: `${projectSlashPath(project.path)}${suffix}` }
								}
								activeOptions={{ exact: true, includeSearch: false }}
								aria-current={active ? "page" : undefined}
								className={cx(
									"sidebar-row text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									indent[Math.min(depth, indent.length - 1)],
									active && "sidebar-selected font-medium",
								)}
							>
								{(workingCounts[label as keyof typeof workingCounts] ?? 0) > 0 ? (
									<WorkingAgentText
										count={workingCounts[label as keyof typeof workingCounts] ?? 0}
										className="sidebar-label"
									>
										{label}
									</WorkingAgentText>
								) : (
									<span className="sidebar-label">{label}</span>
								)}
								{trailing !== null && <span className="sidebar-trailing text-fg-faint">{trailing}</span>}
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</li>
	);
}
