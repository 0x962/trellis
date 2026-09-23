import type { ProjectSummary } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";

// The colors that projects hold. `exceptId` is the project a form writes, so
// that project does not take its own color away from itself.
export const takenColors = (projects: readonly ProjectSummary[], exceptId?: string): ProjectColor[] =>
	projects.flatMap((project) => (project.color === null || project.id === exceptId ? [] : [project.color]));
