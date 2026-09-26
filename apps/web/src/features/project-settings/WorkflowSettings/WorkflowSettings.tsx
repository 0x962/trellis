import type { Project } from "@trellis/api";
import { LabelSettings } from "../LabelSettings";
import { StatusSettings } from "../StatusSettings";
import { TicketTemplateSettings } from "../TicketTemplateSettings";

export function WorkflowSettings({ project }: { project: Project }) {
	return (
		<div className="project-settings-sections">
			<TicketTemplateSettings project={project} />
			<StatusSettings project={project} />
			<LabelSettings project={project} />
		</div>
	);
}
