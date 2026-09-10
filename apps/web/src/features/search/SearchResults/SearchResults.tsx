import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime, formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import type { View } from "../../filters/grammar";
import { ProjectKey } from "../../shell/ProjectKey";
import { PeekListProvider } from "../../ticket/TicketPeek/providers/PeekListProvider";
import { highlight } from "../utils/highlight";

export type SearchResultsProps = {
	q: string;
	filters?: Partial<View>;
	// Renders inside the results' peek list, so a peek there walks the
	// ticket results in the order the page lists them.
	children?: ReactNode;
};

// A result row is 36 px, as a table row is, and hovers on the band. In a
// collapsed table the 1 px row line adds to the row box, so the row sets
// 35 px.
const rowClass = "h-[35px] border-b border-border text-fg transition-colors duration-hover ease-out hover:bg-band";
const linkClass =
	"inline-flex h-9 items-center focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The tickets and the projects that match `q`, as display-only rows with the
// table's cells: priority, ID, the title with each matched word marked, the
// project, the status icon, and the last update.
export function SearchResults({ q, filters = {}, children }: SearchResultsProps) {
	const { orpc } = useApp();
	const { tickets, projects } = useSuspenseQuery(orpc.search.query.queryOptions({ input: { q } })).data;
	const visibleTickets = tickets.filter(
		(ticket) => filters.priority === undefined || filters.priority.includes(ticket.priority),
	);
	const peekRows = visibleTickets.map((ticket) => ({ identifier: ticket.identifier, visible: true }));
	return (
		<PeekListProvider rows={peekRows}>
			<div className="flex flex-col">
				<p className="flex h-8 items-center px-5 text-sm text-fg-muted tabular">
					{formatCount(visibleTickets.length)} {visibleTickets.length === 1 ? "ticket" : "tickets"}
					{projects.length > 0 &&
						` · ${formatCount(projects.length)} ${projects.length === 1 ? "project" : "projects"}`}
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
							return (
								<tr key={ticket.id} className={rowClass}>
									<td className="w-9 pl-5">
										<PriorityIcon priority={ticket.priority} />
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
											{segments.length > 1 && (
												<span className="truncate font-mono text-sm text-fg-muted">{segments.at(-1)}</span>
											)}
										</span>
									</td>
									<td className="w-8">
										<StatusIcon
											category={ticket.status.category}
											reviewer={ticket.status.reviewer ?? undefined}
											label={ticket.status.name}
										/>
									</td>
									<td className="w-14 pr-5 text-right text-sm text-fg-muted tabular">
										{compactRelativeTime(ticket.updatedAt)}
									</td>
								</tr>
							);
						})}
						{projects.map((project) => (
							<tr key={project.id} className={rowClass}>
								<td colSpan={2} className="pl-5">
									<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} className={linkClass}>
										<ProjectKey projectKey={project.key} />
									</Link>
								</td>
								<td className="truncate pr-3 text-base">{highlight(project.name, q)}</td>
								<td colSpan={3} className="pr-5 font-mono text-xs text-fg-faint">
									{projectSlashPath(project.path)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{children}
		</PeekListProvider>
	);
}
