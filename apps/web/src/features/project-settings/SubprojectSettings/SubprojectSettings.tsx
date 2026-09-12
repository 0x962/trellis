import { CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import { SettingsSection } from "../SettingsSection";

export type SubprojectSettingsProps = {
	project: Project;
};

// The sub-projects, one 36 px row each. A row opens the settings of that
// sub-project.
export function SubprojectSettings({ project }: SubprojectSettingsProps) {
	return (
		<SettingsSection
			title="Subprojects"
			hint="Organize related work into subprojects. Each shares the project key and inherits statuses unless customized."
		>
			{project.children.length === 0 ? (
				<p className="text-sm text-fg-muted">No subprojects. Use the project menu in the sidebar to add one.</p>
			) : (
				<ul className="flex flex-col">
					{project.children.map((child) => (
						<li key={child.id}>
							<Link
								to="/p/$"
								params={{ _splat: `${projectSlashPath(child.path)}/settings` }}
								search={{}}
								className="flex h-9 items-center gap-3 rounded-md px-2 text-base text-fg transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
							>
								<span className="min-w-0 flex-1 truncate">{child.name}</span>
								<span className="text-sm text-fg-faint tabular">{formatCount(child.openCount)} open</span>
								<CaretRight aria-hidden="true" className="size-3 text-fg-faint" />
							</Link>
						</li>
					))}
				</ul>
			)}
		</SettingsSection>
	);
}
