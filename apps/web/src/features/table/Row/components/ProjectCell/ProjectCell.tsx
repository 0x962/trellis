import { ProjectKey } from "@trellis/ui";
import { useProjectColor } from "../../../../../hooks/useProjectColor";

export type ProjectCellProps = {
	// The key of the ticket's project.
	projectKey: string;
	// The key of the viewed project, or undefined on /all.
	viewedProject?: string;
};

// The project of a row. Inside one project every row shares the key, so the
// cell stays empty there.
export function ProjectCell({ projectKey, viewedProject }: ProjectCellProps) {
	const color = useProjectColor(projectKey);
	if (viewedProject !== undefined) return null;
	return <ProjectKey projectKey={projectKey} color={color} />;
}
