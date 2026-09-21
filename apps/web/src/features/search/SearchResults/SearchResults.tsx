import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState, PriorityIcon, StatusIcon, useMediaQuery } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime, formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import type { View } from "../../filters/grammar";
import { ProjectKey } from "../../shell/ProjectKey";
import { highlight } from "../utils/highlight";

export type SearchResultsProps = {
	q: string;
	filters?: Partial<View>;
};

// A result row is 36 px, as a table row is, and hovers on the band. Below
// 768 px it takes the two-line box of the table's phone row, 56 px.
const rowClass = "h-9 border-b border-border text-fg transition-colors duration-hover ease-out hover:bg-band";
const phoneRowClass = "h-14 border-b border-border text-fg transition-colors duration-hover ease-out hover:bg-band";
// The link takes no height of its own, so the row keeps its 36 px.
const linkClass =
	"inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
// Below 768 px one link fills the whole row, so a tap anywhere on the 56 px
// row opens the result, and the target clears 44 px on both axes.
const phoneLinkClass =
	"flex h-14 w-full flex-col justify-center gap-1 px-4 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The tickets and the projects that match `q`, as display-only rows with the
// table's cells: the status icon, ID, the title with each matched word marked,
// the project, the priority, and the last update. Below 768 px a row takes
// the table's phone treatment: two lines in one cell, and the whole row is
// the link.
export function SearchResults({ q, filters = {} }: SearchResultsProps) {
	const { orpc } = useApp();
	const phone = useMediaQuery("(max-width: 767px)");
	const { tickets, projects } = useSuspenseQuery(orpc.search.query.queryOptions({ input: { q } })).data;
	const visibleTickets = tickets.filter(
		(ticket) => filters.priority === undefined || filters.priority.includes(ticket.priority),
	);
	// TRL-35. With no ticket and no project left, the page takes the same
	// empty state it shows with no query, and the title names the query. A
	// summary line that reads "0 tickets" over an empty page states the count
	// and nothing else.
	if (visibleTickets.length === 0 && projects.length === 0) {
		return (
			<EmptyState
				variant="page"
				title={`No results for '${q}'`}
				description="No ticket title, no ticket description, and no project name holds this text. Check the spelling, or search for one word."
			/>
		);
	}
	return (
		<div className="flex flex-col">
			<p className="flex h-8 items-center px-5 text-sm text-fg-muted tabular">
				{formatCount(visibleTickets.length)} {visibleTickets.length === 1 ? "ticket" : "tickets"}
				{projects.length > 0 && ` · ${formatCount(projects.length)} ${projects.length === 1 ? "project" : "projects"}`}
			</p>
			<table
				// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: The keyboard treats each result as one selectable grid row.
				role="grid"
				aria-label="Search results"
				className="w-full table-fixed border-collapse"
			>
				<tbody>
					{visibleTickets.map((ticket) => {
						const segments = ticket.project.path.split(".");
						if (phone) {
							return (
								<tr key={ticket.id} className={phoneRowClass}>
									<td data-line="phone" colSpan={6}>
										<Link to="/t/$identifier" params={{ identifier: ticket.identifier }} className={phoneLinkClass}>
											<span className="flex items-center gap-3">
												<StatusIcon
													category={ticket.status.category}
													reviewer={ticket.status.reviewer ?? undefined}
													label={ticket.status.name}
												/>
												<span className="font-mono text-sm text-fg-faint tabular">{ticket.identifier}</span>
												<span className="flex-1" />
												<PriorityIcon priority={ticket.priority} />
												<span className="text-xs text-fg-faint tabular">{compactRelativeTime(ticket.updatedAt)}</span>
											</span>
											<span data-line="title" className="truncate text-sm">
												{highlight(ticket.title, q)}
											</span>
										</Link>
									</td>
								</tr>
							);
						}
						return (
							<tr key={ticket.id} className={rowClass}>
								<td className="w-9 pl-5">
									<StatusIcon
										category={ticket.status.category}
										reviewer={ticket.status.reviewer ?? undefined}
										label={ticket.status.name}
									/>
								</td>
								<td className="w-20">
									<Link to="/t/$identifier" params={{ identifier: ticket.identifier }} className={linkClass}>
										<span className="font-mono text-sm text-fg-faint tabular">{ticket.identifier}</span>
									</Link>
								</td>
								<td className="truncate pr-3 text-base">{highlight(ticket.title, q)}</td>
								<td className="w-40 pr-3" title={projectSlashPath(ticket.project.path)}>
									<span className="flex min-w-0 items-center gap-1.5">
										<ProjectKey projectKey={segments[0]!} />
										{segments.length > 1 && <span className="truncate text-sm text-fg-muted">{segments.at(-1)}</span>}
									</span>
								</td>
								<td className="w-8">
									<PriorityIcon priority={ticket.priority} />
								</td>
								<td className="w-14 pr-5 text-right text-sm text-fg-muted tabular">
									{compactRelativeTime(ticket.updatedAt)}
								</td>
							</tr>
						);
					})}
					{projects.map((project) =>
						phone ? (
							<tr key={project.id} className={phoneRowClass}>
								<td data-line="phone" colSpan={6}>
									<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} className={phoneLinkClass}>
										<span className="flex items-center gap-3">
											<ProjectKey projectKey={project.key} />
											<span className="flex-1" />
											<span className="truncate text-xs text-fg-faint">{projectSlashPath(project.path)}</span>
										</span>
										<span data-line="title" className="truncate text-sm">
											{highlight(project.name, q)}
										</span>
									</Link>
								</td>
							</tr>
						) : (
							<tr key={project.id} className={rowClass}>
								<td colSpan={2} className="pl-5">
									<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} className={linkClass}>
										<ProjectKey projectKey={project.key} />
									</Link>
								</td>
								<td className="truncate pr-3 text-base">{highlight(project.name, q)}</td>
								<td colSpan={3} className="pr-5 text-xs text-fg-faint">
									{projectSlashPath(project.path)}
								</td>
							</tr>
						),
					)}
				</tbody>
			</table>
		</div>
	);
}
