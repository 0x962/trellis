import { Plus, SidebarSimple, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { cx, IconButton, Kbd, Tooltip } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { projectRefOfPathname } from "../../../../../lib/projectUrl";
import { projectMoreActions } from "../../../../../stores/projectMoreStore";
import { uiActions } from "../../../../../stores/uiStore";
import { AgentsMenu } from "../../../../agents/AgentsMenu";
import { menuLinkIcons, type NavTarget, navRows } from "../../../../navRows";
import { sessionComposerActions } from "../../../../sessions/sessionComposerStore";
import { ActorFooter } from "../../../ActorFooter";
import { SidebarMachinePressure } from "../../../MachinePressure";
import { ProjectTree } from "../../../ProjectTree";
import { SessionList } from "../../../SessionList";
import { ConnectionPanel } from "../ConnectionPanel";
import { NavRow } from "./components/NavRow";

// A nav row is active on its own page and on every page under it: Flows
// stays marked on the editor of one flow.
const isActive = (pathname: string, to: NavTarget) => pathname === to || pathname.startsWith(`${to}/`);

export type SidebarBodyProps = {
	// True while the desktop sidebar is a rail of icons. The phone sheet is
	// never a rail, so it leaves this off.
	collapsed?: boolean;
	// The collapse button of the desktop sidebar. The phone sheet has its
	// own way to close, so it passes nothing and shows no button.
	onCollapse?: () => void;
	// The phone sheet supplies its dismissal action. The desktop sidebar has
	// the collapse action instead.
	onClose?: () => void;
};

// The sidebar holds the optional collapse button, the fixed destinations, the
// sessions, the project list, and the actor footer. The desktop aside and the
// phone sheet both draw it. The phone sheet closes in its own way, so it has
// no collapse button.
//
// The sessions and the project list share the one region that scrolls and
// takes the spare height. Every fixed destination sits above it, so none of
// them moves when the region grows.
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function SidebarBody({ collapsed = false, onCollapse, onClose }: SidebarBodyProps) {
	const { live, orpc } = useApp();
	const menuLinksQuery = useQuery(orpc.settings.get.queryOptions({ select: (settings) => settings.menuLinks }));
	const menuLinks = menuLinksQuery.data;
	const status = useLiveStatus(live);
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const project = projectRefOfPathname(pathname);
	// `pathname` follows the page the outlet shows, so a link and the Back
	// button of the browser both reach this call.
	useEffect(() => {
		projectMoreActions.setShownPathname(pathname);
	}, [pathname]);
	const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

	return (
		<>
			<div data-sidebar-toolbar="" className="flex shrink-0 items-center justify-between">
				{!collapsed && (
					<div className="sidebar-brand">
						<span aria-hidden="true" className="sidebar-brand-mark" />
						<span className="sidebar-brand-name">trellis</span>
					</div>
				)}
				{onCollapse && (
					<Tooltip
						side="right"
						content={
							<span className="inline-flex items-center gap-1.5">
								{toggleLabel}
								<Kbd>[</Kbd>
							</span>
						}
					>
						{/* The circle centres on the row icons below it. Its 44 px
						    coarse target stays inside the 48 px rail. */}
						<IconButton
							label={toggleLabel}
							icon={<SidebarSimple />}
							className="ml-0.5 pointer-coarse:ml-0"
							onClick={onCollapse}
						/>
					</Tooltip>
				)}
				{onClose && (
					<Tooltip content="Close sidebar">
						<IconButton
							label="Close sidebar"
							icon={<X />}
							className="max-md:size-11 max-md:before:inset-0"
							onClick={onClose}
						/>
					</Tooltip>
				)}
			</div>
			<nav
				aria-label="Workspace"
				aria-busy={menuLinksQuery.data === undefined && menuLinksQuery.failureCount === 0 ? true : undefined}
				className="flex flex-col gap-0.5"
			>
				{navRows.map((row) => (
					<NavRow
						key={row.to}
						to={row.to}
						search={row.to === "/search" && project !== null ? { rankProject: project } : undefined}
						icon={row.icon}
						label={row.label}
						accessibleLabel={collapsed ? row.label : undefined}
						active={isActive(pathname, row.to)}
						trailing={row.to === "/search" && !collapsed ? <Kbd>/</Kbd> : undefined}
					/>
				))}
				<AgentsMenu collapsed={collapsed} />
				<SidebarMachinePressure collapsed={collapsed} />
				{menuLinks?.map((link) => (
					<NavRow
						key={link.id}
						icon={menuLinkIcons[link.icon]}
						label={link.label}
						accessibleLabel={collapsed ? link.label : undefined}
						browserUrl={link.url}
					/>
				))}
			</nav>
			{/* The `hidden` attribute draws in the base layer of the stylesheet and
			    a display utility draws in the utilities layer, which wins. So the
			    rail keeps `display: flex` and shows the whole list while
			    `collapsed` is true, unless the class stays off. */}
			<div
				data-sidebar-scroll=""
				hidden={collapsed}
				className={cx("min-h-0 flex-1 flex-col overflow-y-auto pb-3", !collapsed && "flex")}
			>
				{/* `shrink-0` keeps each list at its own height. A flex column
				    squeezes them to fit, and then the region never scrolls. */}
				<div className="shrink-0">
					<div className="sidebar-section">
						<h2>Sessions</h2>
						<Tooltip content="New session">
							<IconButton
								size="xs"
								className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
								label="New session"
								icon={<Plus />}
								onClick={() => {
									// The dialog mounts from the root shell. The phone sheet
									// closes first, so no second modal sits under the dialog.
									uiActions.setMobileSidebarOpen(false);
									sessionComposerActions.open();
								}}
							/>
						</Tooltip>
					</div>
					<SessionList />
					<div data-sidebar-projects-section="" className="sidebar-section">
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
				</div>
			</div>
			<div className="mt-auto shrink-0">
				<ConnectionPanel status={status} collapsed={collapsed} />
				<ActorFooter collapsed={collapsed} />
			</div>
		</>
	);
}
