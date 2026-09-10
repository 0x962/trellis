import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusIcon, TicketId } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import { ProjectKey } from "../../shell/ProjectKey";

export type SearchResultsProps = {
	q: string;
};

const rowClass =
	"flex h-9 items-center gap-3 border-b border-border px-5 text-fg transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The tickets and the projects that match `q`, as rows that open them.
export function SearchResults({ q }: SearchResultsProps) {
	const { orpc } = useApp();
	const { tickets, projects } = useSuspenseQuery(orpc.search.query.queryOptions({ input: { q } })).data;
	return (
		<div className="flex flex-col">
			<p className="h-8 px-5 leading-8 text-sm text-fg-muted tabular">
				{formatCount(tickets.length)} {tickets.length === 1 ? "ticket" : "tickets"} · {formatCount(projects.length)}{" "}
				{projects.length === 1 ? "project" : "projects"}
			</p>
			{tickets.map((ticket) => (
				<Link key={ticket.id} to="/t/$identifier" params={{ identifier: ticket.identifier }} className={rowClass}>
					<TicketId id={ticket.identifier} className="w-16" />
					<span className="min-w-0 flex-1 truncate">{ticket.title}</span>
					<span className="flex shrink-0 items-center gap-1.5 text-sm text-fg-muted">
						<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
						{ticket.status.name}
					</span>
				</Link>
			))}
			{projects.map((project) => (
				<Link key={project.id} to="/p/$" params={{ _splat: projectSlashPath(project.path) }} className={rowClass}>
					<ProjectKey projectKey={project.key} />
					<span className="min-w-0 flex-1 truncate">{project.name}</span>
					<span className="font-mono text-xs text-fg-faint">{projectSlashPath(project.path)}</span>
				</Link>
			))}
		</div>
	);
}
