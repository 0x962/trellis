import { ProjectKey } from "@trellis/ui";

export type ProjectCellProps = {
	// The key of the ticket's project. A row carries the key of its project
	// and not the color, so the chip stays grey here.
	projectKey: string;
	// The key of the viewed project, or undefined on /all.
	viewedProject?: string;
};

// The project of a row. Inside one project every row shares the key, so the
// cell stays empty there.
export function ProjectCell({ projectKey, viewedProject }: ProjectCellProps) {
	if (viewedProject !== undefined) return null;
	return <ProjectKey projectKey={projectKey} color={null} />;
}
