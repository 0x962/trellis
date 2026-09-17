import { Link, useLocation } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import type { ReactNode } from "react";
import { projectSlashPath } from "../../../lib/projectPath";
import { NotesSettings } from "../../notes/NotesSettings";
import { useProjectManagerConfig } from "../hooks/useProjectManagerConfig";
import { LabelSettings } from "../LabelSettings";
import { ProjectGeneralSettings } from "../ProjectGeneralSettings";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { StatusSettings } from "../StatusSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

const sections = [
	{ id: "", label: "General" },
	{ id: "notes", label: "Notes" },
	{ id: "template", label: "Ticket template" },
	{ id: "statuses", label: "Statuses" },
	{ id: "labels", label: "Labels" },
	{ id: "archive", label: "Danger Zone" },
] as const;

export type ProjectSettingsSectionId = (typeof sections)[number]["id"];
export type ProjectSettingsProps = { project: Project; section?: ProjectSettingsSectionId };

const isProjectSettingsSection = (value: string): value is ProjectSettingsSectionId =>
	sections.some((section) => section.id === value);

export function ProjectSettings({ project, section }: ProjectSettingsProps) {
	return <ProjectSettingsContent key={project.id} project={project} section={section} />;
}

function ProjectSettingsContent({ project, section }: ProjectSettingsProps) {
	const hash = useLocation({ select: (location) => location.hash });
	const selected = section ?? (isProjectSettingsSection(hash) ? hash : "");
	const manager = useProjectManagerConfig(project);

	const contentFor = (id: ProjectSettingsSectionId): ReactNode => {
		switch (id) {
			case "":
				return <ProjectGeneralSettings project={project} manager={manager} />;
			case "notes":
				return selected === "notes" ? <NotesSettings project={project} /> : null;
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
					{sections.map(({ id, label }) => (
						<li key={id}>
							<Link
								to="/p/$"
								params={{ _splat: `${projectSlashPath(project.path)}/settings` }}
								search={{}}
								hash={id}
								hashScrollIntoView={false}
								activeOptions={{ exact: true, includeHash: true }}
								aria-current={selected === id ? "page" : undefined}
								className="project-settings-nav-link"
							>
								{label}
							</Link>
						</li>
					))}
				</ul>
			</nav>
			<div className="project-settings-content">
				{sections.map(({ id }) => {
					const content = contentFor(id);
					if (content === null) return null;
					return (
						<div key={id} hidden={selected !== id} className="project-settings-page">
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
