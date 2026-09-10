import { useNavigate } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { Menu, type MenuItem, toast } from "@trellis/ui";
import { Archive, ArchiveRestore, Copy, FolderPlus, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { projectSlashPath } from "../../../lib/projectPath";
import { composerActions } from "../../composer";
import { toCli } from "../../filters/cli";
import { DeleteProjectDialog, useProjectActions } from "../../project-actions";
import { NewSubprojectDialog } from "../NewSubprojectDialog";

export type ProjectRowActionsProps = {
	project: ProjectSummary;
};

// The row menu of a project in the sidebar. An archived project takes no
// new sub-project and no new ticket, so its menu offers only unarchive,
// settings, and delete.
export function ProjectRowActions({ project }: ProjectRowActionsProps) {
	const navigate = useNavigate();
	const { setArchived } = useProjectActions();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const archived = project.archivedAt !== null;

	const copyFilter = async () => {
		await navigator.clipboard.writeText(toCli({ project: project.path }));
		toast("Copied the CLI filter");
	};

	const settings: MenuItem = {
		label: "Settings",
		icon: <Settings />,
		onSelect: () => {
			void navigate({
				to: "/p/$",
				params: { _splat: `${projectSlashPath(project.path)}/settings` },
				search: {},
			});
		},
	};
	const remove: MenuItem = { label: "Delete…", icon: <Trash2 />, danger: true, onSelect: () => setDeleteOpen(true) };
	const items: MenuItem[] = archived
		? [
				{ label: "Unarchive", icon: <ArchiveRestore />, onSelect: () => void setArchived(project, false) },
				settings,
				remove,
			]
		: [
				{ label: "New sub-project", icon: <FolderPlus />, onSelect: () => setCreateOpen(true) },
				{ label: "New ticket", icon: <Plus />, onSelect: () => composerActions.open({ project: project.path }) },
				settings,
				{ label: "Copy CLI filter", icon: <Copy />, onSelect: () => void copyFilter() },
				{ label: "Archive", icon: <Archive />, onSelect: () => void setArchived(project, true) },
				remove,
			];

	return (
		<>
			<Menu label={`Actions for ${project.name}`} items={items} />
			<NewSubprojectDialog project={project} open={createOpen} onOpenChange={setCreateOpen} />
			<DeleteProjectDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
		</>
	);
}
