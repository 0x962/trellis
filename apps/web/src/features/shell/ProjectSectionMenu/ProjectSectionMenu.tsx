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
			// The button pads itself by 6 px, so its label would start 6 px right of
			// the label of a plain page title. A transform moves the drawn box back
			// by that padding. A margin cannot do it: the button sits inside the
			// `h1`, so a negative margin takes 6 px off the width the heading asks
			// for, and the heading then cuts the last letters of the name.
			//
			// Under 768 px `Topbar` cuts every `h1` of the bar with an ellipsis, so
			// the heading there is a box that clips. The drawn button must stay
			// inside it, or that box takes the left edge of the hover fill and of
			// the focus ring, and the transform stops.
			trigger={<TitleMenuButton className="-translate-x-1.5 max-md:translate-x-0" label={label} />}
		/>
	);
}
