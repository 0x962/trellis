import { useState } from "react";
import {
	ProjectSettingsView,
	type ProjectSettingsViewProps,
} from "../../../../features/project-settings/ProjectSettingsView";

export function ProjectSettingsJourneyView({
	project,
	section: initial,
}: Pick<ProjectSettingsViewProps, "project" | "section">) {
	const [section, setSection] = useState(initial);
	return <ProjectSettingsView project={project} section={section} onSectionChange={setSection} />;
}
