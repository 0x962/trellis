import { CaretDown } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Menu } from "@trellis/ui";
import { type ProjectSectionId, projectSectionItems, projectSectionLabel } from "./projectSectionItems";

export type ProjectSectionMenuProps = {
	// The key of the project the page sits under, `TRL`.
	projectKey: string;
	// The section the page on screen belongs to.
	current: ProjectSectionId;
};

// The page name in the top bar, as a button that opens the other sections
// of the same project. The caret is always drawn, so the name reads as a
// control before the pointer reaches it. The epic switcher of a single epic
// page draws the same shape.
export function ProjectSectionMenu({ projectKey, current }: ProjectSectionMenuProps) {
	const navigate = useNavigate();
	return (
		<Menu
			label={projectSectionLabel(current)}
			align="start"
			triggerTooltip="Switch section"
			items={projectSectionItems(current, (section) => void navigate({ href: section.href(projectKey) }))}
			trigger={
				<button
					type="button"
					className="flex h-7 max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 data-[popup-open]:bg-band max-md:h-11 pointer-coarse:h-11"
				>
					<span className="min-w-0 truncate">{projectSectionLabel(current)}</span>
					<CaretDown aria-hidden="true" weight="bold" className="size-4 shrink-0 text-fg" />
				</button>
			}
		/>
	);
}
