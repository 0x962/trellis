import type { ProjectSummary } from "@trellis/api";
import { ProjectKey } from "@trellis/ui";
import type { PaletteRow } from "../../rows";

// One row per project: the key badge, the name, then the muted path.
// The name shows once; the path tells two projects of one name apart.
export const projectRows = (
	projects: readonly ProjectSummary[],
	value: (project: ProjectSummary) => string,
	run: (project: ProjectSummary) => () => void,
): PaletteRow[] =>
	projects.map((project) => ({
		value: value(project),
		label: project.name,
		sub: project.key,
		leading: <ProjectKey projectKey={project.key} color={project.color} />,
		keywords: [project.key, project.key, project.key],
		run: run(project),
	}));
