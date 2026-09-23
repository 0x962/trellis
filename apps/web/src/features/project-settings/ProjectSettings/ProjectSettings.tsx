import type { Project } from "@trellis/api";
import { SettingsNav } from "@trellis/ui";
import type { ReactNode } from "react";

import { NotesSettings } from "../../notes/NotesSettings";
import { LabelSettings } from "../LabelSettings";
import { ProjectGeneralSettings } from "../ProjectGeneralSettings";
import { ProjectLifecycle } from "../ProjectLifecycle";
import type { ProjectSettingsSectionId } from "../projectSettingsUrl";
import { StatusSettings } from "../StatusSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

const sections: readonly { id: ProjectSettingsSectionId; label: string }[] = [
	{ id: "", label: "General" },
	{ id: "notes", label: "Notes" },
	{ id: "template", label: "Ticket template" },
	{ id: "statuses", label: "Statuses" },
	{ id: "labels", label: "Labels" },
	{ id: "archive", label: "Danger Zone" },
];

export type ProjectSettingsProps = {
	project: Project;
	section: ProjectSettingsSectionId;
	onSectionChange: (section: ProjectSettingsSectionId) => void;
};

// The settings of one project. The caller holds the section, because the
// URL belongs to the page under the sheet that draws this view.
export function ProjectSettings({ project, section, onSectionChange }: ProjectSettingsProps) {
	return (
		<ProjectSettingsContent key={project.id} project={project} section={section} onSectionChange={onSectionChange} />
	);
}

function ProjectSettingsContent({ project, section, onSectionChange }: ProjectSettingsProps) {
	const contentFor = (id: ProjectSettingsSectionId): ReactNode => {
		switch (id) {
			case "":
				return <ProjectGeneralSettings project={project} />;
			case "notes":
				return section === "notes" ? <NotesSettings project={project} /> : null;
			case "template":
				return <TicketTemplateSettings project={project} />;
			case "statuses":
				return <StatusSettings project={project} />;
			case "labels":
				return <LabelSettings project={project} />;
			case "archive":
				return <ProjectLifecycle project={project} />;
		}
	};
	return (
		<div className="project-settings-layout">
			<SettingsNav
				label="Project settings"
				items={sections}
				selected={section}
				onSelect={(id) => onSectionChange(id as ProjectSettingsSectionId)}
			/>
			<div className="project-settings-content">
				{sections.map(({ id }) => {
					const content = contentFor(id);
					if (content === null) return null;
					return (
						<div key={id} hidden={section !== id} className="project-settings-page">
							<fieldset
								disabled={id !== "archive" && id !== "notes" && project.archivedAt !== null}
								className="min-w-0"
							>
								{content}
							</fieldset>
						</div>
					);
				})}
			</div>
		</div>
	);
}
