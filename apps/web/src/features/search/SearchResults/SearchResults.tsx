import { FileHtml } from "@phosphor-icons/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState, GroupHeader, PriorityIcon, ProjectKey, StatusIcon, useMediaQuery } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime, formatCount } from "../../../lib/format";
import { projectColorsByKey } from "../../../lib/projectChipColor";
import type { View } from "../../filters/grammar";
import { TicketLink } from "../../shell/TicketLink";
import { highlight } from "../utils/highlight";

export type SearchResultsProps = {
	q: string;
	filters?: Partial<View> & { rankProject?: string };
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

const ResultGroup = ({ label, count, children }: { label: string; count: number; children: ReactNode }) => (
	<section aria-label={label}>
		<GroupHeader
			group={label.toLowerCase()}
			label={label}
			count={formatCount(count)}
			collapsible={false}
			appearance="band"
		/>
		<table
			// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: The keyboard treats each result as one selectable grid row.
			role="grid"
			aria-label={`${label} search results`}
			className="w-full table-fixed border-collapse"
		>
			<tbody>{children}</tbody>
		</table>
	</section>
);

// Search keeps each result type in one section. A phone row uses the same
// two-line treatment and 56 px height as a ticket table row.
export function SearchResults({ q, filters = {} }: SearchResultsProps) {
	const { orpc } = useApp();
	const phone = useMediaQuery("(max-width: 767px)");
	const { tickets, pages, projects } = useSuspenseQuery(
		orpc.search.query.queryOptions({ input: { q, rankProject: filters.rankProject } }),
	).data;
	// A ticket or Page row carries a project key without its color. The project
	// list supplies that color.
	const colors = useQuery({
		...orpc.projects.list.queryOptions({ input: {} }),
		select: projectColorsByKey,
	}).data;
	const visibleTickets = tickets.filter(
		(ticket) => filters.priority === undefined || filters.priority.includes(ticket.priority),
	);
	if (visibleTickets.length === 0 && pages.length === 0 && projects.length === 0) {
		return (
			<EmptyState
				variant="page"
				title={`No results for '${q}'`}
				description="No ticket, Page, or project holds this text. Check the spelling, or search for one word."
			/>
		);
	}
	return (
		<div className="flex flex-col">
			<p className="flex h-8 items-center px-5 text-sm text-fg-muted tabular">
				{formatCount(visibleTickets.length)} {visibleTickets.length === 1 ? "ticket" : "tickets"}
				{pages.length > 0 && ` · ${formatCount(pages.length)} ${pages.length === 1 ? "Page" : "Pages"}`}
				{projects.length > 0 && ` · ${formatCount(projects.length)} ${projects.length === 1 ? "project" : "projects"}`}
			</p>
			{visibleTickets.length > 0 && (
				<ResultGroup label="Tickets" count={visibleTickets.length}>
					{visibleTickets.map((ticket) => {
						const segments = ticket.project.key.split(".");
						if (phone) {
							return (
								<tr key={ticket.id} className={phoneRowClass}>
									<td data-line="phone" colSpan={6}>
										<TicketLink identifier={ticket.identifier} className={phoneLinkClass}>
											<span className="flex items-center gap-3">
												<StatusIcon category={ticket.status.category} label={ticket.status.name} />
												<span className="font-mono text-sm text-fg-faint tabular">{ticket.identifier}</span>
												<span className="flex-1" />
												<PriorityIcon priority={ticket.priority} />
												<span className="text-xs text-fg-faint tabular">{compactRelativeTime(ticket.updatedAt)}</span>
											</span>
											<span data-line="title" className="truncate text-sm">
												{highlight(ticket.title, q)}
											</span>
										</TicketLink>
									</td>
								</tr>
							);
						}
						return (
							<tr key={ticket.id} className={rowClass}>
								<td className="w-9 pl-5">
									<StatusIcon category={ticket.status.category} label={ticket.status.name} />
								</td>
								<td className="w-20">
									<TicketLink identifier={ticket.identifier} className={linkClass}>
										<span className="font-mono text-sm text-fg-faint tabular">{ticket.identifier}</span>
									</TicketLink>
								</td>
								<td className="truncate pr-3 text-base">{highlight(ticket.title, q)}</td>
								<td className="w-40 pr-3" title={ticket.project.key}>
									<span className="flex min-w-0 items-center gap-1.5">
										<ProjectKey projectKey={segments[0]!} color={colors?.[segments[0]!] ?? null} />
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
				</ResultGroup>
			)}
			{pages.length > 0 && (
				<ResultGroup label="Pages" count={pages.length}>
					{pages.map((page) => {
						const segments = page.projectKey.split(".");
						const href = `${page.projectKey}/pages/${page.slug}`;
						if (phone) {
							return (
								<tr key={page.id} className={phoneRowClass}>
									<td data-line="phone" colSpan={6}>
										<Link to="/p/$" params={{ _splat: href }} search={{}} className={phoneLinkClass}>
											<span className="flex items-center gap-3">
												<FileHtml aria-hidden="true" className="size-4 text-fg-faint" />
												<span className="font-mono text-sm text-fg-faint">{page.projectKey}</span>
												<span className="flex-1" />
												<span className="text-xs text-fg-faint tabular">v{page.latestVersion}</span>
												<span className="text-xs text-fg-faint tabular">{compactRelativeTime(page.publishedAt)}</span>
											</span>
											<span data-line="title" className="truncate text-sm">
												{highlight(page.title, q)}
											</span>
										</Link>
									</td>
								</tr>
							);
						}
						return (
							<tr key={page.id} className={rowClass}>
								<td className="w-9 pl-5">
									<FileHtml aria-hidden="true" className="size-4 text-fg-faint" />
								</td>
								<td className="w-20 font-mono text-sm text-fg-faint">Page</td>
								<td className="truncate pr-3 text-base" title={page.summary || page.title}>
									<Link to="/p/$" params={{ _splat: href }} search={{}} className={linkClass}>
										{highlight(page.title, q)}
									</Link>
								</td>
								<td className="w-40 pr-3" title={page.projectKey}>
									<span className="flex min-w-0 items-center gap-1.5">
										<ProjectKey projectKey={segments[0]!} color={colors?.[segments[0]!] ?? null} />
										{segments.length > 1 && <span className="truncate text-sm text-fg-muted">{segments.at(-1)}</span>}
									</span>
								</td>
								<td className="w-8 text-sm text-fg-muted tabular">v{page.latestVersion}</td>
								<td className="w-14 pr-5 text-right text-sm text-fg-muted tabular">
									{compactRelativeTime(page.publishedAt)}
								</td>
							</tr>
						);
					})}
				</ResultGroup>
			)}
			{projects.length > 0 && (
				<ResultGroup label="Projects" count={projects.length}>
					{projects.map((project) =>
						phone ? (
							<tr key={project.id} className={phoneRowClass}>
								<td data-line="phone" colSpan={6}>
									<Link to="/p/$" params={{ _splat: project.key }} className={phoneLinkClass}>
										<span className="flex items-center gap-3">
											<ProjectKey projectKey={project.key} color={project.color} />
											<span className="flex-1" />
											<span className="truncate text-xs text-fg-faint">{project.key}</span>
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
									<Link to="/p/$" params={{ _splat: project.key }} className={linkClass}>
										<ProjectKey projectKey={project.key} color={project.color} />
									</Link>
								</td>
								<td className="truncate pr-3 text-base">{highlight(project.name, q)}</td>
								<td colSpan={3} className="pr-5 text-xs text-fg-faint">
									{project.key}
								</td>
							</tr>
						),
					)}
				</ResultGroup>
			)}
		</div>
	);
}
