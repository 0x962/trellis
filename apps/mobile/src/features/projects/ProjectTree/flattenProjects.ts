import type { ProjectSummary } from "@trellis/api";

// Two projects with one parent draw in position order. Two positions that
// are equal draw in id order, so one list always gives one order.
const inOrder = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position || (a.id < b.id ? -1 : 1);

// The path of the project above this one: CDE.web.auth sits under CDE.web,
// and CDE sits under the empty path, which stands for the top of the tree.
const parentPathOf = (project: ProjectSummary) => project.path.split(".").slice(0, -1).join(".");

// The display order of the project tree: every root by position, and under
// each root its own descendants, each level by position. Two projects with
// one parent and one position order by id, so two renders of one list give
// one order. `projects.list` returns the flat rows this reads.
export const flattenProjects = (projects: readonly ProjectSummary[]): ProjectSummary[] => {
	const byParentPath = new Map<string, ProjectSummary[]>();
	for (const project of projects) {
		const path = parentPathOf(project);
		byParentPath.set(path, [...(byParentPath.get(path) ?? []), project]);
	}
	const rows: ProjectSummary[] = [];
	const walk = (parentPath: string) => {
		for (const project of (byParentPath.get(parentPath) ?? []).sort(inOrder)) {
			rows.push(project);
			walk(project.path);
		}
	};
	walk("");
	return rows;
};
