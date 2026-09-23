import type { ProjectSummary } from "@trellis/api";

// The value the project select carries for a flow that applies to every
// project. A project key holds upper-case letters and digits only, so no key
// can take this value.
export const everyProjectValue = "every";

// The items of the project select. A flow belongs to the root project of a
// tree, so the list holds one item per root and no sub-project. `path` of a
// root is its key, such as `TRL`.
export const flowProjectItems = (projects: ProjectSummary[]) => [
	{ value: everyProjectValue, label: "Every project" },
	...projects
		.filter((project) => project.parentId === null)
		.map((project) => ({ value: project.path, label: project.path })),
];

export const selectValueOfProjectKey = (projectKey: string | null): string => projectKey ?? everyProjectValue;

export const projectRefOfSelectValue = (value: string): string | null => (value === everyProjectValue ? null : value);
