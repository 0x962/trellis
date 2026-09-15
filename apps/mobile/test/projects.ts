import type { ProjectSummary } from "@trellis/api";

// A ULID is 26 Crockford base32 characters. The suffix names the row, so a
// test reads an id and knows which project it belongs to.
export const projectId = (suffix: string) => `01J8Z6X4Q3M2K1H0G9F8${suffix.toUpperCase()}`.slice(0, 26).padEnd(26, "0");

export type ProjectSeed = {
	// The canonical project ref, such as CDE.web.
	path: string;
	name?: string;
	position?: number;
	openCount?: number;
	// Overrides the id, for a test about the order of two tied positions.
	id?: string;
};

// One row of `projects.list`. The path gives the key, the slug, the parent,
// and the depth, so a seed names the path and nothing else.
export const projectSummary = ({ path, name, position = 0, openCount = 0, id }: ProjectSeed): ProjectSummary => {
	const segments = path.split(".");
	const parentPath = segments.slice(0, -1).join(".");
	const slug = segments[segments.length - 1]!;
	return {
		id: id ?? projectId(path.replace(/\./g, "")),
		parentId: parentPath === "" ? null : projectId(parentPath.replace(/\./g, "")),
		rootId: projectId(segments[0]!),
		key: segments[0]!,
		slug: slug.toLowerCase(),
		path,
		name: name ?? slug,
		depth: segments.length - 1,
		position,
		openCount,
		archivedAt: null,
	};
};
