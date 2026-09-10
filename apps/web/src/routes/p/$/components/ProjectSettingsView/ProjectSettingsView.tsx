import type { Project } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import type { ReactNode } from "react";
import { ProjectKey } from "../../../../../features/shell/ProjectKey";
import { Topbar } from "../../../../../features/shell/Topbar";
import { formatCount } from "../../../../../lib/format";

export type ProjectSettingsViewProps = {
	project: Project;
};

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
	return (
		<section className="flex gap-8 border-b border-border py-5">
			<div className="w-48 shrink-0">
				<h2 className="font-medium text-fg">{title}</h2>
				<p className="mt-0.5 text-sm text-fg-muted">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
		</section>
	);
}

// `/p/CDE/settings`: the key, the statuses, the sub-projects, and the
// ticket template, read-only.
export function ProjectSettingsView({ project }: ProjectSettingsViewProps) {
	const inherited = project.statusesInheritedFrom !== null;
	return (
		<>
			<Topbar>
				<h1 className="text-md font-semibold text-fg">{project.key} settings</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8">
				<div className="flex max-w-3xl flex-col">
					<Section title="Key" hint="Every ticket in this project and under it is numbered with the key.">
						<div className="flex items-center gap-2 text-sm text-fg-muted">
							<ProjectKey projectKey={project.key} />
							<span className="tabular">
								{formatCount(project.ticketCounter)} {project.ticketCounter === 1 ? "ticket" : "tickets"} numbered so
								far
							</span>
						</div>
					</Section>
					<Section
						title="Statuses"
						hint={
							inherited
								? `Inherited from ${project.ancestors[0]?.key ?? project.key}.`
								: "This project owns its statuses."
						}
					>
						<ul className="flex flex-col gap-1.5">
							{project.statuses.map((status) => (
								<li key={status.id} className="flex items-center gap-2 text-fg">
									<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
									{status.name}
									<span className="font-mono text-xs text-fg-faint">{status.slug}</span>
								</li>
							))}
						</ul>
					</Section>
					<Section title="Sub-projects" hint="A sub-project shares the key and inherits the statuses.">
						{project.children.length === 0 ? (
							<p className="text-sm text-fg-muted">None yet.</p>
						) : (
							<ul className="flex flex-col gap-1.5">
								{project.children.map((child) => (
									<li key={child.id} className="flex items-center gap-2 text-fg">
										{child.name}
										<span className="text-xs text-fg-faint tabular">{formatCount(child.openCount)} open</span>
									</li>
								))}
							</ul>
						)}
					</Section>
					<Section title="Ticket template" hint="The description a new ticket starts with.">
						<pre className="rounded-md border border-border bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-fg-muted">
							{project.ticketTemplate === "" ? "Empty." : project.ticketTemplate}
						</pre>
					</Section>
				</div>
			</div>
		</>
	);
}
