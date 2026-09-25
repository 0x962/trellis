import { Plus, SidebarSimple } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ActivityDot, cx, IconButton, Kbd, Tooltip } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { projectRefOfPathname } from "../../../../../lib/projectUrl";
import { projectMoreActions } from "../../../../../stores/projectMoreStore";
import { uiActions } from "../../../../../stores/uiStore";
import { menuLinkIcons, type NavTarget, navRows } from "../../../../navRows";
import { useNeedsYouSummary } from "../../../../needs-you/useNeedsYou";
import { sessionComposerActions } from "../../../../sessions/sessionComposerStore";
import { ActorFooter } from "../../../ActorFooter";
import { ArchivedProjects } from "../../../ArchivedProjects";
import { ArchivedSessions } from "../../../ArchivedSessions";
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
// The archive area holds the archived sessions and the archived projects. It
// is the last child of that region and carries `mt-auto`, so a short list
// leaves it at the bottom edge of the region, directly above the connection
// panel and the actor footer. A list that fills the region leaves no spare
// height, so the archive area follows the project list and a scroll reaches
// it.
//
// The highlight follows the page the outlet shows. A navigation changes the
// URL at once but keeps the old page until the new one loads, so the
// highlight moves when the page does.
export function SidebarBody({ collapsed = false, onCollapse }: SidebarBodyProps) {
	const { live, orpc } = useApp();
	const menuLinks = useQuery(orpc.settings.get.queryOptions({ select: (settings) => settings.menuLinks })).data;
	const inbox = useNeedsYouSummary();
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
	const needsYouActive = (inbox.data?.active ?? 0) > 0;
	const needsYouMark = needsYouActive ? (
		<ActivityDot label="Needs you has items" placement={collapsed ? "corner" : "inline"} tone="metal" />
	) : undefined;

	return (
		<>
			<div data-sidebar-toolbar="" className={`mb-1 flex h-13 shrink-0 items-center${collapsed ? "" : " justify-end"}`}>
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
				)}
			</div>
			<nav aria-label="Workspace" className="flex flex-col gap-0.5">
				{navRows.map((row) => (
					<NavRow
						key={row.to}
						to={row.to}
						search={row.to === "/search" && project !== null ? { rankProject: project } : undefined}
						iconMark={row.to === "/needs-you" && collapsed ? needsYouMark : undefined}
						icon={row.icon}
						label={row.label}
						accessibleLabel={collapsed ? row.label : undefined}
						active={isActive(pathname, row.to)}
						trailing={
							row.to === "/search" && !collapsed ? (
								<Kbd>/</Kbd>
							) : row.to === "/needs-you" && !collapsed ? (
								needsYouMark
							) : undefined
						}
					/>
				))}
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
			<div hidden={collapsed} className={cx("mt-3 min-h-0 flex-1 flex-col overflow-y-auto pb-2", !collapsed && "flex")}>
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
				</div>
				<div className="mt-auto flex shrink-0 flex-col">
					<ArchivedSessions />
					<ArchivedProjects />
				</div>
			</div>
			<div className="mt-auto shrink-0">
				<ConnectionPanel status={status} />
				<ActorFooter collapsed={collapsed} />
			</div>
		</>
	);
}
