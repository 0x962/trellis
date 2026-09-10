import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Badge, cx, IconButton, Kbd, TrellisMark } from "@trellis/ui";
import { Inbox, List, Moon, PanelLeftClose, Plus, Search, Sun } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { useLiveStatus } from "../../../lib/liveStatus";
import { useSidebarHotkey } from "../../../lib/sidebarHotkey";
import { toggleTheme, useTheme } from "../../../lib/theme";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { needsYouCount } from "../../needs-you/utils/needsYouCount";
import { ActorFooter } from "../ActorFooter";
import { ArchivedProjects } from "../ArchivedProjects";
import { ProjectTree } from "../ProjectTree";
import { ConnectionDot } from "./components/ConnectionDot";

const rowClass =
	"flex h-7 items-center gap-2 rounded-md px-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

type NavTarget = "/needs-you" | "/search" | "/all";

type NavRowProps = { to: NavTarget; icon: ReactElement; label: string; active: boolean; trailing?: ReactNode };

function NavRow({ to, icon, label, active, trailing }: NavRowProps) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cx(rowClass, active && "bg-accent-soft text-fg")}
		>
			<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
				{icon}
			</span>
			<span className="flex-1 truncate">{label}</span>
			{trailing}
		</Link>
	);
}

// A nav row is active on its own page and on every page under it: All
// tickets stays marked on the All tickets board.
const isActive = (pathname: string, to: NavTarget) => pathname === to || pathname.startsWith(`${to}/`);

// The 240 px sidebar: the workspace row, the three fixed destinations, the
// project tree, and the actor footer. `[` collapses it; a collapsed sidebar
// is out of the layout and out of the accessibility tree, and the topbar
// shows the button that brings it back.
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function Sidebar() {
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	const { live, orpc } = useApp();
	const status = useLiveStatus(live);
	const { resolved } = useTheme();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	useSidebarHotkey();
	const inbox = useQuery(orpc.inbox.get.queryOptions({ input: {} }));
	const needsYou = inbox.data === undefined ? 0 : needsYouCount(inbox.data);

	return (
		<aside
			aria-label="Sidebar"
			hidden={collapsed}
			aria-hidden={collapsed || undefined}
			className="flex h-full w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-bg px-2 py-2.5 text-base"
		>
			<div className="mb-1.5 flex h-7 items-center gap-2 pl-2">
				<TrellisMark />
				<span className="font-mono text-md font-medium text-fg">trellis</span>
				<ConnectionDot status={status} />
				<span className="ml-auto flex items-center">
					<IconButton
						size="sm"
						label={resolved === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
						icon={resolved === "dark" ? <Sun /> : <Moon />}
						onClick={toggleTheme}
					/>
					<IconButton size="sm" label="Collapse sidebar" icon={<PanelLeftClose />} onClick={uiActions.toggleSidebar} />
				</span>
			</div>
			<NavRow
				to="/needs-you"
				icon={<Inbox />}
				label="Needs you"
				active={isActive(pathname, "/needs-you")}
				trailing={
					needsYou > 0 ? (
						<Badge tone="accent" size="sm">
							{formatCount(needsYou)}
						</Badge>
					) : undefined
				}
			/>
			<NavRow
				to="/search"
				icon={<Search />}
				label="Search"
				active={isActive(pathname, "/search")}
				trailing={<Kbd>/</Kbd>}
			/>
			<NavRow to="/all" icon={<List />} label="All tickets" active={isActive(pathname, "/all")} />
			<div className="flex items-center justify-between pt-3 pb-1 pl-2 text-xs font-medium tracking-[0.04em] text-fg-faint uppercase">
				<span>Projects</span>
				<IconButton
					size="sm"
					label="New project"
					icon={<Plus />}
					onClick={() => navigate({ to: "/setup", search: { step: "project" } })}
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ProjectTree />
				<ArchivedProjects />
			</div>
			<ActorFooter />
		</aside>
	);
}
