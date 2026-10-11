import { SidebarSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@trellis/ui";
import { AgentsMenu } from "../../agents/AgentsMenu";
import { navRows } from "../../navRows";

// ShellSidebar uses the static rows list, so the root route can paint it before route data arrives.
export function ShellSidebar() {
	return (
		<aside
			aria-label="Sidebar"
			aria-busy="true"
			className="sidebar-shell relative flex h-full w-60 shrink-0 flex-col gap-0.5 border-r px-3 pb-2 max-md:hidden"
		>
			<div data-sidebar-toolbar="" className="flex shrink-0 items-center justify-between">
				<div className="sidebar-brand">
					<span aria-hidden="true" className="sidebar-brand-mark" />
					<span className="sidebar-brand-name">trellis</span>
				</div>
				<span aria-hidden="true" className="inline-flex size-7 items-center justify-center text-fg-muted">
					<SidebarSimple className="size-3.5" />
				</span>
			</div>
			{navRows.map((row) => (
				<Link
					key={row.to}
					to={row.to}
					className="sidebar-row gap-2 px-2 focus-visible:outline-2 focus-visible:-outline-offset-2"
				>
					<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
						{row.icon}
					</span>
					<span className="flex-1 truncate">{row.label}</span>
				</Link>
			))}
			<AgentsMenu />
			<div data-sidebar-scroll="" className="min-h-0 flex-1 overflow-hidden">
				<div className="sidebar-section">
					<span>Sessions</span>
				</div>
				<Skeleton lines={3} width="w-34" className="sidebar-shell-skeleton gap-4 px-2 py-1" />
				<div data-sidebar-projects-section="" className="sidebar-section">
					<span>Projects</span>
				</div>
				<Skeleton lines={2} width="w-34" className="sidebar-shell-skeleton gap-4 px-2 py-1" />
			</div>
		</aside>
	);
}
