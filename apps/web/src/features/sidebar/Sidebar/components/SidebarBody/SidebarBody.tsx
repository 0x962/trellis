import {
	ChartLine,
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
import { ActivityDot, cx, IconButton, Kbd, Tooltip } from "@trellis/ui";
import { type ReactElement, type ReactNode, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { useNeedsYouSummary } from "../../../../needs-you/useNeedsYou";
import { ActorFooter } from "../../../ActorFooter";
import { ArchivedProjects } from "../../../ArchivedProjects";
import { NewSessionDialog } from "../../../NewSessionDialog";
import { ProjectTree } from "../../../ProjectTree";
import { SessionList } from "../../../SessionList";
import { ConnectionPanel } from "../ConnectionPanel";

const rowClass =
	"sidebar-row pl-2 text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

type NavTarget = "/reviews" | "/needs-you" | "/search" | "/all" | "/ai/personas" | "/ai/flows" | "/usage";

type NavRowProps = {
	to: NavTarget;
	icon: ReactElement;
	label: string;
	active: boolean;
	trailing?: ReactNode;
	hasItems?: boolean;
};

function NavRow({ to, icon, label, active, trailing, hasItems }: NavRowProps) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cx(rowClass, active && "sidebar-selected font-medium")}
		>
			<span data-slot="leading" className="sidebar-leading">
				<span className="relative inline-flex">
					<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
						{icon}
					</span>
					{hasItems && <ActivityDot label="Needs you has items" />}
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

// What the sidebar holds: the collapse button, the seven fixed destinations,
// the sessions, the project tree, and the actor footer. The desktop aside
// and the phone sheet both draw it. The phone sheet closes in its own way,
// so it has no collapse button.
//
// The sessions and the project tree share the one region that scrolls and
// takes the spare height. Every fixed destination sits above it, so none of
// them moves when the region grows.
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function SidebarBody({ collapsed = false, onCollapse }: SidebarBodyProps) {
	const { live } = useApp();
	const inbox = useNeedsYouSummary();
	const status = useLiveStatus(live);
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
	const [newSession, setNewSession] = useState(false);

	return (
		<>
			{onCollapse && (
				<div data-sidebar-toolbar="" className="mb-1 flex h-13 shrink-0 items-center">
					<Tooltip
						side="right"
						content={
							<span className="inline-flex items-center gap-1.5">
								{toggleLabel}
								<Kbd>[</Kbd>
							</span>
						}
					>
						{/* The circle centres on the row icons below it. A coarse
						    pointer draws it at 44 px, and the negative margin keeps
						    all of it inside the 48 px rail, which clips its overflow. */}
						<IconButton
							label={toggleLabel}
							icon={<SidebarSimple />}
							className="ml-0.5 pointer-coarse:-ml-1.5"
							onClick={onCollapse}
						/>
					</Tooltip>
				</div>
			)}
			<nav aria-label="Workspace" className="flex flex-col gap-0.5">
				<NavRow
					to="/needs-you"
					hasItems={(inbox.data?.active ?? 0) > 0}
					icon={<Tray />}
					label="Needs you"
					active={isActive(pathname, "/needs-you")}
				/>
				<NavRow
					to="/search"
					icon={<MagnifyingGlass />}
					label="Search"
					active={isActive(pathname, "/search")}
					trailing={collapsed ? undefined : <Kbd>/</Kbd>}
				/>
				<NavRow to="/all" icon={<Ticket />} label="All tickets" active={isActive(pathname, "/all")} />
				<NavRow to="/reviews" icon={<GitPullRequest />} label="Pull requests" active={isActive(pathname, "/reviews")} />
				<NavRow to="/ai/personas" icon={<Sparkle />} label="Personas" active={isActive(pathname, "/ai/personas")} />
				<NavRow to="/ai/flows" icon={<FlowArrow />} label="Flows" active={isActive(pathname, "/ai/flows")} />
				<NavRow to="/usage" icon={<ChartLine />} label="Usage" active={isActive(pathname, "/usage")} />
			</nav>
			<div hidden={collapsed} className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
				<div className="sidebar-section">
					<h2>Sessions</h2>
					<Tooltip content="New session">
						<IconButton
							size="xs"
							className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
							label="New session"
							icon={<Plus />}
							onClick={() => setNewSession(true)}
						/>
					</Tooltip>
				</div>
				<SessionList />
				<div className="sidebar-section mt-3">
					<h2>Projects</h2>
					<Tooltip content="New project">
						<IconButton
							size="xs"
							className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
							label="New project"
							icon={<Plus />}
							onClick={() => navigate({ to: "/setup", search: { step: "project" } })}
						/>
					</Tooltip>
				</div>
				<ProjectTree />
				<ArchivedProjects />
			</div>
			{newSession && <NewSessionDialog onClose={() => setNewSession(false)} />}
			<div className="mt-auto shrink-0">
				<ConnectionPanel status={status} />
				<ActorFooter collapsed={collapsed} />
			</div>
		</>
	);
}
