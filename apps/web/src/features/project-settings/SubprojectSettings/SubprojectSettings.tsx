import { Link } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";
import { SettingsSection } from "../SettingsSection";

export type SubprojectSettingsProps = {
	project: Project;
};

export function SubprojectSettings({ project }: SubprojectSettingsProps) {
	return (
		<SettingsSection title="Sub-projects" hint="Each sub-project shares the key and inherits the statuses.">
			{project.children.length === 0 ? (
				<p className="text-sm text-fg-muted">None yet.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{project.children.map((child) => (
						<li key={child.id}>
							<Link
								to="/p/$"
								params={{ _splat: projectSlashPath(child.path) }}
								search={{}}
								className="flex h-8 items-center justify-between rounded-md px-2 text-sm text-fg hover:bg-bg"
							>
								<span>{child.name}</span>
								<span className="tabular text-xs text-fg-faint">{formatCount(child.openCount)} open</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</SettingsSection>
	);
}
