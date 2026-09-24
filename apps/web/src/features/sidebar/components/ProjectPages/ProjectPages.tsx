import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { ActivityDot, cx } from "@trellis/ui";
import { memo } from "react";
import { activeAgentsLabel } from "../../../agents/activeAgents";
import { hiddenAgentCount, type ProjectPageRow, projectPageRows } from "./projectPageRows";

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
	moreOpen,
	onToggleMore,
}: {
	project: ProjectSummary;
	pathname: string;
	// The Sessions row shows a dot while the number is above zero.
	activeAgentCount: number;
	// True while the More row shows the pages it holds. The caller opens More
	// for the page on screen alone, so every arrival at another page draws it
	// shut.
	moreOpen: boolean;
	onToggleMore: () => void;
}) {
	const { top, more } = projectPageRows(project, pathname, activeAgentCount);
	const agentCountUnderMore = moreOpen ? 0 : hiddenAgentCount(more);
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
							aria-expanded={moreOpen}
							onClick={onToggleMore}
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
									{moreOpen ? <CaretDown /> : <CaretRight />}
								</span>
							</span>
						</button>
						{moreOpen && <ul className="flex flex-col">{more.map((row) => pageLink(row, true))}</ul>}
					</li>
				</ul>
			</nav>
		</li>
	);
});
