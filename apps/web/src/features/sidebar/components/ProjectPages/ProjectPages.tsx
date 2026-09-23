import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { ActivityDot, cx } from "@trellis/ui";
import { memo } from "react";
import { uiActions, useUiStore } from "../../../../stores/uiStore";
import { activeAgentsLabel } from "../../../agents/activeAgents";
import { type ProjectPageRow, projectPageRows } from "./projectPageRows";

// A page row sits one step right of the project row, and a row the More row
// holds sits one step further.
const rowClass = (inMore: boolean, active: boolean) =>
	cx(
		"sidebar-row text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
		inMore ? "pl-11" : "pl-8",
		active && "sidebar-selected font-medium",
	);

export const ProjectPages = memo(function ProjectPages({
	project,
	pathname,
	activeAgentCount,
}: {
	project: ProjectSummary;
	pathname: string;
	// The Sessions row shows a dot while the number is above zero.
	activeAgentCount: number;
}) {
	const { top, more } = projectPageRows(project, pathname, activeAgentCount);
	const stored = useUiStore((state) => state.expandedProjectMore[project.id] ?? false);
	// The row of the page on screen must stay on screen. A page that the More
	// row holds therefore keeps More open, whatever the person stored.
	const open = stored || more.some((row) => row.active);
	// A shut More row hides the Sessions row, so the More row shows the dot of
	// the rows under it until the person opens them.
	const agentCountUnderMore = open ? 0 : more.reduce((total, row) => total + row.activeAgentCount, 0);
	const pageLink = (row: ProjectPageRow, inMore: boolean) => (
		<li key={row.label}>
			<Link
				data-project-page=""
				to={row.suffix === "/sessions" ? "/sessions/project/$project" : "/p/$"}
				params={row.suffix === "/sessions" ? { project: project.key } : { _splat: `${project.key}${row.suffix}` }}
				activeOptions={{ exact: true, includeSearch: false }}
				aria-current={row.active ? "page" : undefined}
				className={rowClass(inMore, row.active)}
			>
				<span className="sidebar-label">{row.label}</span>
				{(row.activeAgentCount > 0 || row.trailing !== null) && (
					<span className="sidebar-trailing text-fg-faint">
						{row.activeAgentCount > 0 && (
							<ActivityDot label={activeAgentsLabel(row.activeAgentCount)} placement="inline" tone="metal" />
						)}
						{row.trailing}
					</span>
				)}
			</Link>
		</li>
	);
	return (
		<li>
			<nav aria-label={`${project.name} pages`}>
				<ul className="flex flex-col">
					{top.map((row) => pageLink(row, false))}
					<li>
						<button
							type="button"
							data-project-page=""
							aria-expanded={open}
							onClick={() => uiActions.toggleProjectMore(project.id)}
							className={cx(rowClass(false, false), "w-full text-left active:bg-elevated")}
						>
							<span className="sidebar-label">More</span>
							<span
								className="sidebar-trailing text-fg-faint"
								data-dot-and-caret={agentCountUnderMore > 0 ? "" : undefined}
							>
								{agentCountUnderMore > 0 && (
									<ActivityDot
										label={activeAgentsLabel(agentCountUnderMore)}
										placement="inline"
										tone="metal"
										focusable={false}
									/>
								)}
								<span aria-hidden="true" className="*:size-3">
									{open ? <CaretDown /> : <CaretRight />}
								</span>
							</span>
						</button>
						{open && <ul className="flex flex-col">{more.map((row) => pageLink(row, true))}</ul>}
					</li>
				</ul>
			</nav>
		</li>
	);
});
