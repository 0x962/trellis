import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { EpicSummary, Project } from "@trellis/api";
import { Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { epicHref, projectHref } from "../../../lib/projectUrl";
import { usePageCreate } from "../../../lib/usePageCreate";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { ProjectSectionMenu } from "../../shell/ProjectSectionMenu";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { type EpicGroup, EpicsList } from "./components/EpicsList";

export type EpicsPageProps = {
	project: Project;
};

const collapsedByDefault: readonly string[] = ["done", "canceled"];

export const isEpicsRetrying = (query: { isFetching: boolean; failureCount: number; error: unknown }) =>
	query.isFetching && (query.failureCount > 0 || query.error !== null);

export function EpicsPage({ project }: EpicsPageProps) {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const readOnly = project.archivedAt !== null;
	const epicsOptions = orpc.epics.list.queryOptions({ input: { project: project.key } });
	const epics = useQuery(epicsOptions);
	const routeKey = projectHref(project.key, "epics");
	const { isCollapsed, toggle } = useCollapsedGroups(routeKey, collapsedByDefault);
	const [editor, setEditor] = useState<{ epic?: EpicSummary } | null>(null);
	const [deleting, setDeleting] = useState<EpicSummary | null>(null);

	const createEpic = () => setEditor({});
	usePageCreate(createEpic, !readOnly);

	const rows = epics.data ?? [];
	const allGroups: EpicGroup[] = [
		{ key: "open", label: "Open", epics: rows.filter((epic) => epic.state === "open") },
		{ key: "done", label: "Done", epics: rows.filter((epic) => epic.state === "done") },
		{ key: "canceled", label: "Canceled", epics: rows.filter((epic) => epic.state === "canceled") },
	];
	const groups = allGroups.filter((group) => group.epics.length > 0);

	const newEpic = readOnly ? undefined : (
		<Tooltip content="New epic">
			<TopbarActionButton label="New epic" icon={<Plus />} onClick={createEpic} />
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
					<EpicsList
						projectId={project.id}
						groups={groups}
						pending={epics.isPending}
						error={epics.failureReason ?? epics.error}
						retrying={isEpicsRetrying(epics)}
						readOnly={readOnly}
						isCollapsed={isCollapsed}
						onToggle={toggle}
						onRetry={() => void epics.refetch()}
						onNew={createEpic}
						onEdit={(epic) => setEditor({ epic })}
						onDelete={setDeleting}
					/>
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
