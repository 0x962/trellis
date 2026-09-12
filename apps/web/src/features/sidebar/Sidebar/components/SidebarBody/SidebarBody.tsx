import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AiGlyph, cx, IconButton, Kbd, TicketGlyph, TrellisWordmark } from "@trellis/ui";
import { Inbox, Plus, Search, Workflow } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { ActorFooter } from "../../../ActorFooter";
import { ArchivedProjects } from "../../../ArchivedProjects";
import { ProjectTree } from "../../../ProjectTree";
import { ConnectionPanel } from "../ConnectionPanel";

const rowClass =
	"flex h-7 items-center rounded-md pr-1 pl-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11";

type NavTarget = "/needs-you" | "/search" | "/all" | "/ai/personas" | "/ai/flows";

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
	// True while the desktop sidebar is a rail of icons. The phone sheet is
	// never a rail, so it leaves this off.
	collapsed?: boolean;
	// The collapse button of the desktop sidebar. The phone sheet has its
	// own way to close, so it passes nothing and shows no button.
	onCollapse?: () => void;
};

// What the sidebar holds: the mark, the four fixed destinations, the
// project tree, and the actor footer. The desktop aside and the phone sheet
// both draw it.
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

	return (
		<>
			<div className="mb-2 flex h-7 items-center pl-2">
				{onCollapse ? (
					// The mark is the control that opens and closes the sidebar.
					// A closed sidebar keeps the first two letters of it.
					<button
						type="button"
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						onClick={onCollapse}
						className="inline-flex h-7 cursor-pointer items-center rounded-md transition-opacity duration-hover ease-out hover:opacity-70 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
					>
						<TrellisWordmark short={collapsed} className="h-4.5" />
					</button>
				) : (
					<TrellisWordmark className="h-4.5" />
				)}
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
				<NavRow to="/all" icon={<TicketGlyph />} label="All tickets" active={isActive(pathname, "/all")} />
			</nav>
			<nav aria-label="AI" hidden={collapsed} className="mt-3 shrink-0">
				<h2 className="sidebar-section">AI</h2>
				<NavRow to="/ai/personas" icon={<AiGlyph />} label="Personas" active={isActive(pathname, "/ai/personas")} />
				<NavRow to="/ai/flows" icon={<Workflow />} label="Flows" active={isActive(pathname, "/ai/flows")} />
			</nav>
			<div hidden={collapsed} className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
				<div className="sidebar-section">
					<h2>Projects</h2>
					<IconButton
						size="xs"
						className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
						round
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
				<ActorFooter />
			</div>
		</>
	);
}
