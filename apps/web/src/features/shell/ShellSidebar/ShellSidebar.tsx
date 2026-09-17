import { Link } from "@tanstack/react-router";
import { navRows } from "../../navRows";

// ShellSidebar uses the static rows list, so the root route can paint it before route data arrives.
export function ShellSidebar() {
	return (
		<aside
			aria-label="Sidebar"
			aria-busy="true"
			className="relative flex h-full w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-surface px-2 pb-2 text-sm max-md:hidden"
		>
			{/* SidebarBody puts its collapse button in a row of this height. */}
			<div className="mb-1 h-13 shrink-0" />
			{navRows.map((row) => (
				<Link
					key={row.to}
					to={row.to}
					className="flex h-8 items-center gap-2 rounded-md px-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
				>
					<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
						{row.icon}
					</span>
					<span className="flex-1 truncate">{row.label}</span>
				</Link>
			))}
			<div className="flex h-7 items-center pt-3 pb-1 pl-2 text-xs font-medium tracking-[0.04em] text-fg-faint uppercase">
				Projects
			</div>
		</aside>
	);
}
