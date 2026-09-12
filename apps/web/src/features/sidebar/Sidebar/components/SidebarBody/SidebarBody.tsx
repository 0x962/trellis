import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cx, IconButton, Kbd, TrellisWordmark } from "@trellis/ui";
import { Inbox, List, PanelLeftClose, Plus, Search, UserRound } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { ActorFooter } from "../../../ActorFooter";
import { ArchivedProjects } from "../../../ArchivedProjects";
import { ProjectTree } from "../../../ProjectTree";
import { ConnectionPanel } from "../ConnectionPanel";

const rowClass =
	"flex h-8 items-center rounded-md pr-1 pl-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11";

type NavTarget = "/needs-you" | "/search" | "/all" | "/ai/personas";

type NavRowProps = { to: NavTarget; icon: ReactElement; label: string; active: boolean; trailing?: ReactNode };

function NavRow({ to, icon, label, active, trailing }: NavRowProps) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cx(rowClass, active && "sidebar-selected font-medium")}
		>
			<span data-slot="leading" className="sidebar-leading">
				<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full [&_svg]:stroke-[1.75]">
					{icon}
				</span>
			</span>
			<span data-slot="label" className="sidebar-label">
				{label}
			</span>
			<span data-slot="trailing" className="sidebar-trailing">
				{trailing}
			</span>
		</Link>
	);
}

// A nav row is active on its own page and on every page under it: All
// tickets stays marked on the All tickets board.
const isActive = (pathname: string, to: NavTarget) => pathname === to || pathname.startsWith(`${to}/`);

export type SidebarBodyProps = {
	// The collapse button of the desktop sidebar. The phone sheet has its
	// own way to close, so it passes nothing and shows no button.
	onCollapse?: () => void;
};

// What the sidebar holds: the workspace row, the three fixed destinations,
// the project tree, the AI section, and the actor footer. The desktop aside
// and the phone sheet both draw it.
//
// The project tree is the one region that scrolls, and it takes the spare
// height. The AI section and the footer sit after it and keep their place,
// so the Personas link stays inside the viewport whatever the tree height
// (TRL-41).
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function SidebarBody({ onCollapse }: SidebarBodyProps) {
	const { live } = useApp();
	const status = useLiveStatus(live);
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });

	return (
		<>
			<div className="mb-4 flex h-8 items-center gap-2 pr-1 pl-2">
				<TrellisWordmark className="h-4.5" />
				<span className="ml-auto flex items-center">
					{onCollapse && (
						<IconButton size="sm" label="Collapse sidebar" icon={<PanelLeftClose />} onClick={onCollapse} />
					)}
				</span>
			</div>
			<nav aria-label="Workspace" className="flex flex-col gap-0.5">
				<NavRow to="/needs-you" icon={<Inbox />} label="Needs you" active={isActive(pathname, "/needs-you")} />
				<NavRow
					to="/search"
					icon={<Search />}
					label="Search"
					active={isActive(pathname, "/search")}
					trailing={<Kbd>/</Kbd>}
				/>
				<NavRow to="/all" icon={<List />} label="All tickets" active={isActive(pathname, "/all")} />
			</nav>
			<div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-4">
				<div className="sidebar-section">
					<h2>Projects</h2>
					<IconButton
						size="sm"
						className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
						label="New project"
						icon={<Plus />}
						onClick={() => navigate({ to: "/setup", search: { step: "project" } })}
					/>
				</div>
				<ProjectTree />
				<ArchivedProjects />
			</div>
			<nav aria-label="AI" className="mt-4 shrink-0">
				<h2 className="sidebar-section">AI</h2>
				<NavRow to="/ai/personas" icon={<UserRound />} label="Personas" active={isActive(pathname, "/ai/personas")} />
			</nav>
			<div className="mt-auto shrink-0">
				<ConnectionPanel status={status} />
				<ActorFooter />
			</div>
		</>
	);
}
