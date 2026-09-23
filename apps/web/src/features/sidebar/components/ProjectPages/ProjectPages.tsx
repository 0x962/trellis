import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { uiActions, useUiStore } from "../../../../stores/uiStore";
import { type ProjectPageRow, projectPageRows } from "./projectPageRows";

// A page row sits one step right of the project row, and a row the More row
// holds sits one step further.
const rowClass = (inMore: boolean, active: boolean) =>
	cx(
		"sidebar-row text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
		inMore ? "pl-11" : "pl-8",
		active && "sidebar-selected font-medium",
	);

export function ProjectPages({ project, pathname }: { project: ProjectSummary; pathname: string }) {
	const { top, more } = projectPageRows(project, pathname);
	const stored = useUiStore((state) => state.expandedProjectMore[project.id] ?? false);
	// The row of the page on screen must stay on screen. A page that the More
	// row holds therefore keeps More open, whatever the person stored.
	const open = stored || more.some((row) => row.active);
	const pageLink = (row: ProjectPageRow, inMore: boolean) => (
		<li key={row.label}>
			<Link
				data-project-page=""
				to={row.suffix === "/sessions" ? "/sessions/project/$project" : "/p/$"}
				params={
					row.suffix === "/sessions" ? { project: project.key } : { _splat: `${project.key}${row.suffix}` }
				}
				activeOptions={{ exact: true, includeSearch: false }}
				aria-current={row.active ? "page" : undefined}
				className={rowClass(inMore, row.active)}
			>
				<span className="sidebar-label">{row.label}</span>
				{row.trailing !== null && <span className="sidebar-trailing text-fg-faint">{row.trailing}</span>}
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
							<span aria-hidden="true" className="sidebar-trailing text-fg-faint *:size-3">
								{open ? <CaretDown /> : <CaretRight />}
							</span>
						</button>
						{open && <ul className="flex flex-col">{more.map((row) => pageLink(row, true))}</ul>}
					</li>
				</ul>
			</nav>
		</li>
	);
}
