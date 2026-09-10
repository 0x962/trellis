import type { Project } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useState } from "react";
import { DeleteProjectDialog, useProjectActions } from "../../project-actions";
import { SettingsSection } from "../SettingsSection";

export type ProjectLifecycleProps = {
	project: Project;
};

// Archive, unarchive, and delete. An archived project is read-only and
// moves to the Archived group of the sidebar; unarchive brings it back.
export function ProjectLifecycle({ project }: ProjectLifecycleProps) {
	const { setArchived } = useProjectActions();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const archived = project.archivedAt !== null;
	return (
		<SettingsSection
			title="Archive and delete"
			hint="An archived project is read-only. A delete removes the project, its sub-projects, and its tickets."
		>
			<div className="flex flex-wrap items-center gap-2">
				<Button onClick={() => void setArchived(project, !archived)}>
					{archived ? "Unarchive project" : "Archive project"}
				</Button>
				<Button variant="danger" onClick={() => setDeleteOpen(true)}>
					Delete project…
				</Button>
			</div>
			<DeleteProjectDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
		</SettingsSection>
	);
}
