import { ArrowDown } from "@phosphor-icons/react";
import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Button,
	EmptyState,
	FailureState,
	IconButton,
	PageRow,
	PriorityIcon,
	ProjectKey,
	StatusIcon,
	Tooltip,
	useMediaQuery,
} from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime, formatCount } from "../../../lib/format";
import { projectColorsByKey } from "../../../lib/projectChipColor";
import type { View } from "../../filters/grammar";
import { TicketLink } from "../../shell/TicketLink";
import { searchOptions } from "../searchOptions";
import { highlight } from "../utils/highlight";
import { ResultGroup } from "./components/ResultGroup";

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

// A phone row uses the same two-line treatment and 56 px height as a ticket
// table row.
export function SearchResults({ q, filters = {} }: SearchResultsProps) {
	const { orpc } = useApp();
	const phone = useMediaQuery("(max-width: 767px)");
	const query = useSuspenseInfiniteQuery(searchOptions(orpc, q, filters.rankProject));
	const tickets = query.data.pages.flatMap((page) => page.tickets);
	const projects = query.data.pages.flatMap((page) => page.projects);
	const pages = query.data.pages.flatMap((page) => page.pages);
	// A ticket row carries a project key without its color. The project list
	// supplies that color.
	const colors = useQuery({
		...orpc.projects.list.queryOptions({ input: {} }),
		select: projectColorsByKey,
	}).data;
	const visibleTickets = tickets.filter(
		(ticket) => filters.priority === undefined || filters.priority.includes(ticket.priority),
	);
	if (visibleTickets.length === 0 && projects.length === 0 && pages.length === 0 && !query.hasNextPage) {
		return (
			<EmptyState
				variant="page"
				title={`No results for '${q}'`}
				description="No ticket, project, or Page holds this text. Check the spelling, or search for one word."
			/>
		);
	}
	return (
		<div className="flex flex-col">
			<p aria-live="polite" className="flex min-h-8 flex-wrap items-center px-5 text-sm text-fg-muted tabular">
				Loaded: {formatCount(visibleTickets.length)} {visibleTickets.length === 1 ? "ticket" : "tickets"}
				{projects.length > 0 && ` · ${formatCount(projects.length)} ${projects.length === 1 ? "project" : "projects"}`}
				{pages.length > 0 && ` · ${formatCount(pages.length)} ${pages.length === 1 ? "Page" : "Pages"}`}
			</p>
			{visibleTickets.length > 0 && (
				<ResultGroup label="Tickets" count={query.hasNextPage ? undefined : visibleTickets.length}>
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
			{projects.length > 0 && (
				<ResultGroup label="Projects" count={query.hasNextPage ? undefined : projects.length}>
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
			{pages.length > 0 && (
				<ResultGroup label="Pages" count={query.hasNextPage ? undefined : pages.length} layout="list">
					{pages.map((page) => (
						<PageRow
							key={page.id}
							variant="search"
							title={page.title}
							titleContent={highlight(page.title, q)}
							summary={page.summary}
							latestVersion={page.latestVersion}
							publishedBy={page.publishedBy.displayName ?? page.publishedBy.name}
							publishedAt={page.publishedAt}
							age={compactRelativeTime(page.publishedAt)}
							watcher={page.watcher?.agent.name ?? null}
							openThreadCount={page.openThreadCount}
							pinned={page.pinned}
							deleted={false}
							project={<ProjectKey projectKey={page.projectKey} color={colors?.[page.projectKey] ?? null} />}
							link={<Link to="/p/$" params={{ _splat: `${page.projectKey}/pages/${page.slug}` }} search={{}} />}
						/>
					))}
				</ResultGroup>
			)}
			{query.isFetchNextPageError && (
				<FailureState
					variant="section"
					title="More results did not load"
					detail={query.error?.message}
					action={<Button onClick={() => void query.fetchNextPage()}>Retry</Button>}
				/>
			)}
			{query.hasNextPage && (
				<div className="flex justify-center py-2">
					<Tooltip content="Load more results">
						<IconButton
							label="Load more results"
							icon={<ArrowDown />}
							disabled={query.isFetching}
							processing={query.isFetchingNextPage}
							onClick={() => void query.fetchNextPage()}
						/>
					</Tooltip>
				</div>
			)}
		</div>
	);
}
