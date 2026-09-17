import { Link, useLocation } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { projectSlashPath } from "../../../lib/projectPath";
import { useProjectManagerConfig } from "../hooks/useProjectManagerConfig";
import { ManagerSettings } from "../ManagerSettings";
import { ProjectGeneralSettings } from "../ProjectGeneralSettings";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { StatusSettings } from "../StatusSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

export type ProjectSettingsProps = { project: Project };

export function ProjectSettings({ project }: ProjectSettingsProps) {
	return <ProjectSettingsContent key={project.id} project={project} />;
}

function ProjectSettingsContent({ project }: ProjectSettingsProps) {
	const hash = useLocation({ select: (location) => location.hash });
	const manager = useProjectManagerConfig(project);
	const pages = [
		{ id: "", label: "General", content: <ProjectGeneralSettings project={project} manager={manager} /> },
		{ id: "template", label: "Ticket template", content: <TicketTemplateSettings project={project} /> },
		{ id: "statuses", label: "Statuses", content: <StatusSettings project={project} /> },
		{ id: "manager", label: "Copilot", content: null },
		{ id: "harness", label: "Harness", content: null },
		{ id: "archive", label: "Danger Zone", content: <ProjectLifecycle project={project} /> },
	];
	const selected = pages.some((page) => page.id === hash) ? hash : "";
	return (
		<div className="project-settings-layout">
			<nav aria-label="Project settings" className="project-settings-nav">
				<p className="project-settings-nav-title">Project settings</p>
				<ul className="project-settings-nav-list">
					{pages.map(({ id, label }) => (
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
				{pages.map(
					({ id, content }) =>
						content !== null && (
							<div key={id} hidden={selected !== id} className="project-settings-page">
								<fieldset disabled={id !== "archive" && project.archivedAt !== null} className="min-w-0">
									{content}
								</fieldset>
							</div>
						),
				)}
				<ManagerSettings project={project} section={selected} manager={manager} />
			</div>
		</div>
	);
}
