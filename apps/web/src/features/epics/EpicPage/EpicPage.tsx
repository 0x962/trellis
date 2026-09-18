import { ORPCError } from "@orpc/client";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Project, TicketSummary } from "@trellis/api";
import { Badge, Button, EmptyState, Menu, SectionHeader, StackedBar } from "@trellis/ui";
import { useState } from "react";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { formatCount } from "../../../lib/format";
import { projectHref, projectSlashPath } from "../../../lib/projectPath";
import { TicketPicker } from "../../pickers/TicketPicker";
import { NotFoundState } from "../../shell/NotFoundState";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { useTicketMutations } from "../../table/hooks/useTicketMutations";
import { useOpenTicket } from "../../ticket/hooks/useOpenTicket";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { epicProgress, epicSegments } from "../epicBar";
import { EpicTicketRow } from "./components/EpicTicketRow";

export type EpicPageProps = {
	project: Project;
	// The epic slug from the URL: `/p/OP/epics/<slug>`.
	slug: string;
};

const breadcrumbLinkClass =
	"inline-flex h-7 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// One epic: the bar of its counts with the legend, its state, the plan as
// markdown, and its tickets in number order. Add puts a ticket of the
// project into the epic; the row menu takes one out. Both are ticket
// writes, so the ticket rows and the epic counts refetch from the ticket
// events.
export function EpicPage({ project, slug }: EpicPageProps) {
	const { orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const openTicket = useOpenTicket();
	const mutations = useTicketMutations();
	const ref = `${project.key}/${slug}`;
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: ref } }));
	const readOnly = project.archivedAt !== null;
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// The epic query refetches after the ticket write, because the write
	// response names no changed fields and the counts live on the epic.
	const setEpic = async (ticket: TicketSummary, epicRef: string | null) => {
		await mutations.updateMany(
			[ticket],
			{ epic: epicRef },
			{},
			(subject) => `${subject} did not ${epicRef === null ? "leave" : "join"} the epic.`,
		);
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
	};

	const parent = (
		<span className="flex min-w-0 items-center gap-2">
			<ProjectBreadcrumb project={project} />
			<span aria-hidden="true" className="text-fg-faint">
				/
			</span>
			<Link
				to="/p/$"
				params={{ _splat: `${projectSlashPath(project.path)}/epics` }}
				search={{}}
				className={breadcrumbLinkClass}
			>
				Epics
			</Link>
		</span>
	);

	if (epic.isPending) {
		return (
			<>
				<Topbar>
					<PageTitle parent={parent} title={slug} />
				</Topbar>
				<div className="page-card flex flex-1 flex-col overflow-hidden">
					<div role="status" className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">
						Load epic…
					</div>
				</div>
			</>
		);
	}

	if (epic.isError) {
		const notFound = epic.error instanceof ORPCError && epic.error.code === "NOT_FOUND";
		return (
			<>
				<Topbar>
					<PageTitle parent={parent} title={slug} />
				</Topbar>
				{notFound ? (
					<NotFoundState ref={ref} />
				) : (
					<EmptyState
						variant="page"
						className="page-card"
						title={`${ref} did not load.`}
						description={errorMessage(epic.error)}
						action={
							<Button size="md" onClick={() => void epic.refetch()}>
								Retry
							</Button>
						}
					/>
				)}
			</>
		);
	}

	const record = epic.data;
	const progress = epicProgress(record.counts);
	const identifiers = record.tickets.map((ticket) => ticket.identifier);

	return (
		<>
			<Topbar
				actions={
					<Menu
						label={`Actions for ${record.name}`}
						triggerTooltip="Epic actions"
						items={[
							{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: () => setEditing(true) },
							{
								label: "Delete…",
								icon: <Trash />,
								danger: true,
								disabled: readOnly,
								onSelect: () => setDeleting(true),
							},
						]}
					/>
				}
			>
				<PageTitle parent={parent} title={record.name} />
			</Topbar>
			<article className="page-card relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
				<div className="mx-auto flex w-full min-w-0 max-w-[856px] flex-col gap-8 px-5 pt-6 pb-8 max-md:px-4">
					<section aria-label="Progress" className="flex flex-col gap-3">
						<div className="flex items-center gap-3">
							<Badge tone={record.state === "done" ? "ok" : "accent"}>
								{record.state === "done" ? "Done" : "Open"}
							</Badge>
							<span className="text-sm text-fg-muted tabular">
								{formatCount(progress.done)} of {formatCount(progress.of)} done
							</span>
						</div>
						<StackedBar label={`Tickets of ${record.name} by status`} segments={epicSegments(record.counts)} />
					</section>
					<section aria-label="Description">
						{record.description.trim() === "" ? (
							<p className="text-sm text-fg-faint">No description. Edit the epic to write the plan.</p>
						) : (
							<ReadOnlyMarkdown markdown={record.description} className="text-md" />
						)}
					</section>
					<section aria-label="Tickets" className="flex flex-col gap-2">
						<SectionHeader
							title="Tickets"
							count={formatCount(record.counts.total)}
							actions={
								readOnly ? undefined : (
									<TicketPicker
										project={project.key}
										exclude={identifiers}
										label="Add to epic"
										placeholder="Add a ticket: an identifier or a title"
										onPick={(ticket) => {
											if (ticket !== null) void setEpic(ticket, record.ref);
										}}
										trigger={
											<Button variant="quiet" size="sm" icon={<Plus />}>
												Add
											</Button>
										}
									/>
								)
							}
						/>
						{record.tickets.length === 0 ? (
							<EmptyState description="Add a ticket of the project to this epic. Its agent then reads the plan in its brief." />
						) : (
							<ul className="overflow-hidden rounded-md border border-border">
								{record.tickets.map((ticket) => (
									<EpicTicketRow
										key={ticket.id}
										ticket={ticket}
										readOnly={readOnly}
										onOpen={() => openTicket(ticket.identifier)}
										onRemove={() => void setEpic(ticket, null)}
									/>
								))}
							</ul>
						)}
					</section>
				</div>
			</article>
			{editing && <EpicSheet project={project} epic={record} onClose={() => setEditing(false)} />}
			<DeleteEpicDialog
				epic={record}
				open={deleting}
				onOpenChange={setDeleting}
				onDeleted={() => void navigate({ href: projectHref(project.path, "epics") })}
			/>
		</>
	);
}
