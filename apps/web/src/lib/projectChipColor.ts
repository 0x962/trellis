import type { ProjectSummary } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";

// The color of a project, read by its key out of the project list. A ticket
// row, a search row and the ticket rail carry the key of a project and no
// color, and the sidebar and the command palette hold the list already, so
// the chip of those rows reads the color from there.
export const colorOfProjectKey = (projects: readonly ProjectSummary[], key: string): ProjectColor | null =>
	projects.find((project) => project.key === key)?.color ?? null;

// The color of every project, by key. A react-query `select` gives back this
// record, and react-query keeps the identity of it while no color changes.
export const projectColorsByKey = (projects: readonly ProjectSummary[]): Record<string, ProjectColor | null> =>
	Object.fromEntries(projects.map((project) => [project.key, project.color]));
