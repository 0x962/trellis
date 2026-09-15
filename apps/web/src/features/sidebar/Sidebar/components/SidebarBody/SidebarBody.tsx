import {
	FlowArrow,
	GitPullRequest,
	MagnifyingGlass,
	Plus,
	SidebarSimple,
	Sparkle,
	Ticket,
	Tray,
} from "@phosphor-icons/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cx, IconButton, Kbd, Tooltip } from "@trellis/ui";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { ActorFooter } from "../../../ActorFooter";
import { ArchivedProjects } from "../../../ArchivedProjects";
import { ProjectTree } from "../../../ProjectTree";
import { ConnectionPanel } from "../ConnectionPanel";

const rowClass =
	"flex h-7 items-center rounded-md pr-1 pl-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11";

type NavTarget = "/reviews" | "/needs-you" | "/search" | "/all" | "/ai/personas" | "/ai/flows";

type NavRowProps = { to: NavTarget; icon: ReactElement; label: string; active: boolean; trailing?: ReactNode };

function NavRow({ to, icon, label, active, trailing }: NavRowProps) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cx(rowClass, active && "sidebar-selected font-medium")}
		>
			<span data-slot="leading" className="sidebar-leading">
				<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
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
	// True while the desktop sidebar is a rail of icons. The phone sheet is
	// never a rail, so it leaves this off.
	collapsed?: boolean;
	// The collapse button of the desktop sidebar. The phone sheet has its
	// own way to close, so it passes nothing and shows no button.
	onCollapse?: () => void;
};

// What the sidebar holds: the collapse button, the four fixed destinations,
// the project tree, and the actor footer. The desktop aside and the phone
// sheet both draw it. The phone sheet closes in its own way, so it has no
// collapse button.
//
// The project tree is the one region that scrolls and takes the spare
// height. Every fixed destination sits above it, so none of them moves when
// the tree grows.
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function SidebarBody({ collapsed = false, onCollapse }: SidebarBodyProps) {
	const { live } = useApp();
	const status = useLiveStatus(live);
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

	return (
		<>
			{onCollapse && (
				<div className="mb-1 flex h-13 shrink-0 items-center">
					<Tooltip
						side="right"
						content={
							<span className="inline-flex items-center gap-1.5">
								{toggleLabel}
								<Kbd>[</Kbd>
							</span>
						}
					>
						<span className="inline-flex">
							<IconButton label={toggleLabel} icon={<SidebarSimple />} className="ml-0.5" onClick={onCollapse} />
						</span>
					</Tooltip>
				</div>
			)}
			<nav aria-label="Workspace" className="flex flex-col gap-0.5">
				<NavRow to="/needs-you" icon={<Tray />} label="Needs you" active={isActive(pathname, "/needs-you")} />
				<NavRow
					to="/search"
					icon={<MagnifyingGlass />}
					label="Search"
					active={isActive(pathname, "/search")}
					trailing={collapsed ? undefined : <Kbd>/</Kbd>}
				/>
				<NavRow to="/all" icon={<Ticket />} label="All tickets" active={isActive(pathname, "/all")} />
				<NavRow to="/reviews" icon={<GitPullRequest />} label="Pull requests" active={isActive(pathname, "/reviews")} />
			</nav>
			<nav aria-label="AI" hidden={collapsed} className="mt-3 shrink-0">
				<h2 className="sidebar-section">AI</h2>
				<NavRow to="/ai/personas" icon={<Sparkle />} label="Personas" active={isActive(pathname, "/ai/personas")} />
				<NavRow to="/ai/flows" icon={<FlowArrow />} label="Flows" active={isActive(pathname, "/ai/flows")} />
			</nav>
			<div hidden={collapsed} className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
				<div className="sidebar-section">
					<h2>Projects</h2>
					<IconButton
						size="xs"
						className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
						label="New project"
						icon={<Plus />}
						onClick={() => navigate({ to: "/setup", search: { step: "project" } })}
					/>
				</div>
				<ProjectTree />
				<ArchivedProjects />
			</div>
			<div className="mt-auto shrink-0">
				<ConnectionPanel status={status} />
				<ActorFooter collapsed={collapsed} />
			</div>
		</>
	);
}
