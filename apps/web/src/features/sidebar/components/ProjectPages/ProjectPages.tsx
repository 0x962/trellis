import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { ActivityDot, cx } from "@trellis/ui";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";
import { useChatUnread } from "../../../chat/useChatUnread";

const indent = ["pl-8", "pl-8", "pl-11", "pl-14", "pl-17"] as const;

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
	const chat = pathname.endsWith("/chat");
	const { unread } = useChatUnread(project.rootId);
	return (
		<li>
			<nav aria-label={`${project.name} pages`}>
				<ul className="flex flex-col">
					{[
						{ label: "Tickets", suffix: "", active: current && !settings && !manager && !chat, dot: false },
						{ label: "Chat", suffix: "/chat", active: current && chat, dot: unread.size > 0 },
						{ label: "Settings", suffix: "/settings", active: current && settings, dot: false },
					].map(({ label, suffix, active, dot }) => (
						<li key={label}>
							<Link
								data-project-page=""
								to="/p/$"
								params={{ _splat: `${projectSlashPath(project.path)}${suffix}` }}
								activeOptions={{ exact: true, includeSearch: false }}
								aria-current={active ? "page" : undefined}
								className={cx(
									"sidebar-row text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									indent[Math.min(depth, indent.length - 1)],
									active && "sidebar-selected font-medium",
								)}
							>
								<span className="sidebar-label">{label}</span>
								{dot && (
									<span data-slot="trailing" className="sidebar-trailing">
										<ActivityDot label="Unread chat messages" placement="inline" />
									</span>
								)}
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</li>
	);
}
