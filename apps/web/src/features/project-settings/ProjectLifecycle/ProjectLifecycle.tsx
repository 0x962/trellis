import type { Project } from "@trellis/api";
import { Button, FieldHint } from "@trellis/ui";
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
			title="Danger Zone"
			hint="Control whether this project stays active, becomes read-only, or is permanently deleted."
		>
			<div className="project-settings-action-row">
				<div className="project-settings-action-copy">
					<h3 className="project-settings-group-title">{archived ? "Restore this project" : "Archive this project"}</h3>
					<FieldHint>
						{archived
							? "Make this project editable and return it to the active project list."
							: "Keep the tickets and make the project read-only. You can restore it later."}
					</FieldHint>
				</div>
				<Button onClick={() => void setArchived(project, !archived)}>
					{archived ? "Unarchive project" : "Archive project"}
				</Button>
			</div>
			<div className="project-settings-action-row">
				<div className="project-settings-action-copy">
					<h3 className="project-settings-group-title">Delete this project</h3>
					<FieldHint>Permanently delete this project and all its tickets.</FieldHint>
				</div>
				<Button variant="danger-soft" onClick={() => setDeleteOpen(true)}>
					Delete project…
				</Button>
			</div>
			<DeleteProjectDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
		</SettingsSection>
	);
}
