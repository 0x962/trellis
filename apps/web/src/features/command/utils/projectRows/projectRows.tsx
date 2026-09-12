import type { ProjectSummary } from "@trellis/api";
import { projectSlashPath } from "../../../../lib/projectPath";
import { ProjectKey } from "../../../shell/ProjectKey";
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
		sub: projectSlashPath(project.path),
		leading: <ProjectKey projectKey={project.key} />,
		keywords: [project.key, project.path, projectSlashPath(project.path)],
		run: run(project),
	}));
