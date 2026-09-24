import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { EpicSummary, Project } from "@trellis/api";
import { Button, EmptyState, GroupHeader, Skeleton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { formatCount } from "../../../lib/format";
import { epicHref, projectHref } from "../../../lib/projectUrl";
import { useUiStore } from "../../../stores/uiStore";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { ProjectSectionMenu } from "../../shell/ProjectSectionMenu";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import { rowHeights } from "../../table/rowHeights";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { EpicRow } from "./components/EpicRow";

export type EpicsPageProps = {
	project: Project;
};

type Group = { key: "open" | "done"; label: string; epics: EpicSummary[] };

// The Done group starts collapsed, as the Done group of the ticket table does.
const collapsedByDefault: readonly string[] = ["done"];

// The width of the name bar on each skeleton line, so the block reads as
// text and not as a grid.
const skeletonWidths = ["w-2/5", "w-1/2", "w-[30%]", "w-[45%]"];

// The epics of a project: the Open group, then the
// Done group, one dense row per epic. The server orders the rows: open
// first, then by the time of the last change.
export function EpicsPage({ project }: EpicsPageProps) {
	const { orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const density = useUiStore((state) => state.density);
	const readOnly = project.archivedAt !== null;
	const epicsOptions = orpc.epics.list.queryOptions({ input: { project: project.key } });
	const epics = useQuery(epicsOptions);
	const routeKey = projectHref(project.key, "epics");
	const { isCollapsed, toggle } = useCollapsedGroups(routeKey, collapsedByDefault);
	const [editor, setEditor] = useState<{ epic?: EpicSummary } | null>(null);
	const [deleting, setDeleting] = useState<EpicSummary | null>(null);

	const rows = epics.data ?? [];
	const failed = epics.data === undefined && epics.failureCount > 0;
	// Only a group that holds an epic renders. The ticket table drops an
	// empty closed group the same way.
	const allGroups: Group[] = [
		{ key: "open", label: "Open", epics: rows.filter((epic) => epic.state === "open") },
		{ key: "done", label: "Done", epics: rows.filter((epic) => epic.state === "done") },
	];
	const groups = allGroups.filter((group) => group.epics.length > 0);

	const newEpic = readOnly ? undefined : (
		<Tooltip content="New epic">
			<TopbarActionButton label="New epic" icon={<Plus />} onClick={() => setEditor({})} />
		</Tooltip>
	);

	return (
		<>
			<Topbar actions={newEpic}>
				<PageTitle
					parent={<ProjectBreadcrumb project={project} />}
					title={<ProjectSectionMenu projectKey={project.key} current="epics" />}
				/>
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{readOnly && <ArchivedBanner project={project} />}
				<div className="min-h-0 flex-1 overflow-y-auto">
					{epics.isPending && !failed ? (
						<div role="status" aria-label="Load epics" aria-busy="true">
							<span className="sr-only">Load epics</span>
							{skeletonWidths.map((width) => (
								<div
									key={width}
									style={{ height: `${rowHeights[density]}px` }}
									className="flex items-center gap-3 border-b border-border px-5 max-md:px-4"
								>
									<div className="min-w-0 flex-1">
										<Skeleton width={width} />
									</div>
									<Skeleton width="w-35" className="max-md:hidden" />
									<Skeleton width="w-12" />
									<Skeleton width="w-12" />
								</div>
							))}
						</div>
					) : failed ? (
						<EmptyState
							variant="page"
							title="Could not load epics"
							action={
								<Button
									size="md"
									onClick={() => void queryClient.resetQueries({ queryKey: epicsOptions.queryKey, exact: true })}
								>
									Retry
								</Button>
							}
						/>
					) : epics.isError ? (
						<EmptyState
							variant="page"
							title="The epics did not load."
							description={errorMessage(epics.error)}
							action={
								<Button size="md" onClick={() => void epics.refetch()}>
									Retry
								</Button>
							}
						/>
					) : rows.length === 0 ? (
						<EmptyState
							variant="page"
							title="No epics"
							description="An epic groups the tickets of one plan."
							action={
								readOnly ? undefined : (
									<Button variant="primary" size="md" onClick={() => setEditor({})}>
										New epic
									</Button>
								)
							}
						/>
					) : (
						groups.map((group) => {
							const expanded = !isCollapsed(group.key);
							const controls = `epics-${project.id}-${group.key}`;
							return (
								<section key={group.key} aria-label={`${group.label} epics`}>
									<GroupHeader
										group={group.key}
										label={group.label}
										count={formatCount(group.epics.length)}
										expanded={expanded}
										controls={controls}
										sticky
										onToggle={() => toggle(group.key)}
									/>
									{expanded && (
										<ul id={controls}>
											{group.epics.map((epic) => (
												<EpicRow
													key={epic.id}
													epic={epic}
													density={density}
													readOnly={readOnly}
													onEdit={() => setEditor({ epic })}
													onDelete={() => setDeleting(epic)}
												/>
											))}
										</ul>
									)}
								</section>
							);
						})
					)}
				</div>
			</div>
			{editor !== null && (
				<EpicSheet
					project={project}
					epic={editor.epic}
					onClose={() => setEditor(null)}
					// A new epic opens on its page, where the tickets join it.
					onSaved={(saved) => {
						if (editor.epic === undefined) void navigate({ href: epicHref(saved.projectKey, saved.slug) });
					}}
				/>
			)}
			{deleting !== null && (
				<DeleteEpicDialog epic={deleting} open onOpenChange={(open) => !open && setDeleting(null)} />
			)}
		</>
	);
}
