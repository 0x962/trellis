import { Link, useLocation } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { projectSlashPath } from "../../../lib/projectPath";
import { ManagerSettings } from "../ManagerSettings";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { RepoSettings } from "../RepoSettings";
import { StatusSettings } from "../StatusSettings";
import { SubprojectSettings } from "../SubprojectSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

export type ProjectSettingsProps = { project: Project };

const sections = [
	{ id: "", label: "General", component: ProjectDetailsForm },
	{ id: "template", label: "Ticket template", component: TicketTemplateSettings },
	{ id: "statuses", label: "Statuses", component: StatusSettings },
	{ id: "repositories", label: "Repositories", component: RepoSettings },
	{ id: "manager", label: "Copilot", component: null },
	{ id: "harness", label: "Harness", component: null },
	{ id: "subprojects", label: "Subprojects", component: SubprojectSettings },
	{ id: "archive", label: "Danger Zone", component: ProjectLifecycle },
];

export function ProjectSettings({ project }: ProjectSettingsProps) {
	const hash = useLocation({ select: (location) => location.hash });
	const selected = sections.some((section) => section.id === hash) ? hash : "";
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
			<div className="project-settings-content" key={project.id}>
				{sections.map(
					({ id, component: Component }) =>
						Component !== null && (
							<div key={id} hidden={selected !== id} className="project-settings-page">
								<fieldset disabled={id !== "archive" && project.archivedAt !== null} className="min-w-0">
									<Component project={project} />
								</fieldset>
							</div>
						),
				)}
				<ManagerSettings project={project} section={selected} />
			</div>
		</div>
	);
}
