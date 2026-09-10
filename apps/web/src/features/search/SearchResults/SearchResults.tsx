import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusIcon, TicketId } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import type { View } from "../../filters/grammar";
import { ProjectKey } from "../../shell/ProjectKey";
import { PeekListProvider } from "../../ticket/TicketPeek/providers/PeekListProvider";

export type SearchResultsProps = {
	q: string;
	filters?: Partial<View>;
	// Renders inside the results' peek list, so a peek there walks the
	// ticket results in the order the page lists them.
	children?: ReactNode;
};

const rowClass = "h-9 border-b border-border text-fg transition-colors duration-hover hover:bg-surface";
const linkClass =
	"inline-flex h-9 items-center focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The tickets and the projects that match `q`, as rows that open them.
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
				<p className="h-8 px-5 leading-8 text-sm text-fg-muted tabular">
					{formatCount(visibleTickets.length)} {visibleTickets.length === 1 ? "ticket" : "tickets"} ·{" "}
					{formatCount(projects.length)} {projects.length === 1 ? "project" : "projects"}
				</p>
				<table
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: The keyboard treats each result as one selectable grid row.
					role="grid"
					aria-label="Search results"
					className="w-full table-fixed border-collapse"
				>
					<tbody>
						{visibleTickets.map((ticket) => (
							<tr key={ticket.id} className={rowClass}>
								<td className="w-24 pl-5">
									<Link to="/t/$identifier" params={{ identifier: ticket.identifier }} className={linkClass}>
										<TicketId id={ticket.identifier} />
									</Link>
								</td>
								<td className="truncate pr-3">{ticket.title}</td>
								<td className="w-40 pr-5 text-sm text-fg-muted">
									<span className="flex items-center gap-1.5">
										<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
										{ticket.status.name}
									</span>
								</td>
							</tr>
						))}
						{projects.map((project) => (
							<tr key={project.id} className={rowClass}>
								<td className="w-24 pl-5">
									<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} className={linkClass}>
										<ProjectKey projectKey={project.key} />
									</Link>
								</td>
								<td className="truncate pr-3">{project.name}</td>
								<td className="w-40 pr-5 font-mono text-xs text-fg-muted">{projectSlashPath(project.path)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{children}
		</PeekListProvider>
	);
}
