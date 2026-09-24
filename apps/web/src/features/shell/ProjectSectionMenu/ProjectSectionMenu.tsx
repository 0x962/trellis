import { useNavigate } from "@tanstack/react-router";
import { Menu } from "@trellis/ui";
import { TitleMenuButton } from "../PageTitle/TitleMenuButton";
import { type ProjectSectionId, projectSectionItems, projectSectionLabel } from "./projectSections";

export type ProjectSectionMenuProps = {
	// The key of the project the page sits under, `TRL`.
	projectKey: string;
	current: ProjectSectionId;
};

export function ProjectSectionMenu({ projectKey, current }: ProjectSectionMenuProps) {
	const navigate = useNavigate();
	const label = projectSectionLabel(current);
	return (
		<Menu
			label={label}
			align="start"
			triggerTooltip="Switch section"
			items={projectSectionItems(current, (section) => void navigate({ href: section.href(projectKey) }))}
			trigger={<TitleMenuButton className="-ml-1.5" label={label} />}
		/>
	);
}
