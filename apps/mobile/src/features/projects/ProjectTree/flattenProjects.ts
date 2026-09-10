import type { ProjectSummary } from "@trellis/api";

// The display order of the project tree: every root by position, and under
// each root its own descendants, each level by position. Two projects with
// one parent and one position order by id, so two renders of one list give
// one order. `projects.list` returns the flat rows this reads.
export const flattenProjects = (_projects: readonly ProjectSummary[]): ProjectSummary[] => {
	throw new Error("flattenProjects is not built yet.");
};
