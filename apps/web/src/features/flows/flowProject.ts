import type { ProjectSummary } from "@trellis/api";

// The value the project select carries for a flow that belongs to every
// project. A project key holds upper-case letters and digits only, so no key
// can take this value.
export const everyProject = "every";

// The items of the project select in the flow editor and in the new flow
// dialog. A flow belongs to the root project of a tree, so the list holds one
// item per root and no sub-project. `path` of a root is its key, such as
// `TRL`.
export const flowProjectItems = (projects: ProjectSummary[]) => [
	{ value: everyProject, label: "Every project" },
	...projects
		.filter((project) => project.parentId === null)
		.map((project) => ({ value: project.path, label: project.path })),
];

// The value the select starts with for a flow. `projectKey` is null when the
// flow belongs to every project.
export const flowProjectValue = (projectKey: string | null): string => projectKey ?? everyProject;

// The `project` field that `flows.create` and `flows.update` take. null gives
// the flow to every project.
export const flowProjectRef = (value: string): string | null => (value === everyProject ? null : value);
