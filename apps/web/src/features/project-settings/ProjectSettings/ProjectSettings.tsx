import { Link, useLocation } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { Archive, FileText, FolderTree, GitBranch, ListTodo, Settings2 } from "lucide-react";
import { projectSlashPath } from "../../../lib/projectPath";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { RepoSettings } from "../RepoSettings";
import { StatusSettings } from "../StatusSettings";
import { SubprojectSettings } from "../SubprojectSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

export type ProjectSettingsProps = { project: Project };

const sections = [
	{ id: "", label: "General", icon: Settings2, component: ProjectDetailsForm },
	{ id: "template", label: "Ticket template", icon: FileText, component: TicketTemplateSettings },
	{ id: "statuses", label: "Statuses", icon: ListTodo, component: StatusSettings },
	{ id: "repositories", label: "Repositories", icon: GitBranch, component: RepoSettings },
	{ id: "subprojects", label: "Subprojects", icon: FolderTree, component: SubprojectSettings },
	{ id: "archive", label: "Archive and delete", icon: Archive, component: ProjectLifecycle },
];

export function ProjectSettings({ project }: ProjectSettingsProps) {
	const hash = useLocation({ select: (location) => location.hash });
	const selected = sections.some((section) => section.id === hash) ? hash : "";
	return (
		<div className="project-settings-layout">
			<nav aria-label="Project settings" className="project-settings-nav">
				<p className="project-settings-nav-title">Project settings</p>
				<ul className="project-settings-nav-list">
					{sections.map(({ id, label, icon: Icon }) => (
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
								<Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
								{label}
							</Link>
						</li>
					))}
				</ul>
			</nav>
			<div className="project-settings-content" key={project.id}>
				{sections.map(({ id, component: Component }) => (
					<div key={id} hidden={selected !== id} className="project-settings-page">
						<fieldset disabled={id !== "archive" && project.archivedAt !== null} className="min-w-0">
							<Component project={project} />
						</fieldset>
					</div>
				))}
			</div>
		</div>
	);
}
