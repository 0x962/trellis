import { BoxArrowUp, DotsThree, Gear, Plus, Trash } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { IconButton, Menu, type MenuItem } from "@trellis/ui";
import { useState } from "react";

import { composerActions } from "../../composer";
import { DeleteProjectDialog, useProjectActions } from "../../project-actions";

export type ProjectRowActionsProps = {
	project: ProjectSummary;
};

// The row menu of a project in the sidebar: a 24 px button that fits the
// row's trailing slot. An open project offers a new ticket and its settings
// page; archive and delete live on that page. An archived project takes no
// new ticket, so its menu offers unarchive, settings, and delete.
export function ProjectRowActions({ project }: ProjectRowActionsProps) {
	const navigate = useNavigate();
	const { setArchived } = useProjectActions();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const archived = project.archivedAt !== null;

	const settings: MenuItem = {
		label: "Settings",
		icon: <Gear />,
		onSelect: () => {
			void navigate({
				to: "/p/$",
				params: { _splat: `${project.key}/settings` },
				search: {},
			});
		},
	};
	const remove: MenuItem = { label: "Delete…", icon: <Trash />, danger: true, onSelect: () => setDeleteOpen(true) };
	const items: MenuItem[] = archived
		? [{ label: "Unarchive", icon: <BoxArrowUp />, onSelect: () => void setArchived(project, false) }, settings, remove]
		: [
				{ label: "New ticket", icon: <Plus />, onSelect: () => composerActions.open({ project: project.key }) },
				settings,
			];

	return (
		<>
			<Menu
				label={`Actions for ${project.name}`}
				items={items}
				trigger={<IconButton size="xs" label={`Actions for ${project.name}`} icon={<DotsThree />} />}
			/>
			<DeleteProjectDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
		</>
	);
}
