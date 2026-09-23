import type { Project } from "@trellis/api";
import type { ReactNode } from "react";

import { NotesSettings } from "../../notes/NotesSettings";
import { LabelSettings } from "../LabelSettings";
import { ProjectGeneralSettings } from "../ProjectGeneralSettings";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { type ProjectSettingsSectionId, projectSettingsSections } from "../projectSettingsUrl";
import { StatusSettings } from "../StatusSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

export type ProjectSettingsProps = {
	project: Project;
	// The section the nav marks and the content shows.
	section: ProjectSettingsSectionId;
	onSectionChange: (section: ProjectSettingsSectionId) => void;
};

// The settings of one project. `ProjectSettingsSheet` draws this view in a
// sheet over the page a person is on, and holds the section it shows. The
// nav is a set of buttons: the URL belongs to the page under the sheet, so
// it cannot carry the section.
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
			<nav aria-label="Project settings" className="project-settings-nav">
				<p className="project-settings-nav-title">Project settings</p>
				<ul className="project-settings-nav-list">
					{projectSettingsSections.map(({ id, label }) => (
						<li key={id}>
							<button
								type="button"
								aria-current={section === id ? "page" : undefined}
								className="project-settings-nav-link"
								onClick={() => onSectionChange(id)}
							>
								{label}
							</button>
						</li>
					))}
				</ul>
			</nav>
			<div className="project-settings-content">
				{projectSettingsSections.map(({ id }) => {
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
