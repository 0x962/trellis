import { flowProjectLabel, type ProjectSummary } from "@trellis/api";

// The value the project select carries for a flow that applies to every
// project. A project key holds upper-case letters and digits only, so no key
// can take this value.
export const everyProjectValue = "every";

// The items of the project select, one per project. An archived project
// takes no new work, so it holds no item.
export const flowProjectItems = (projects: ProjectSummary[]) => [
	{ value: everyProjectValue, label: flowProjectLabel({ project: null }) },
	...projects
		.filter((project) => project.archivedAt === null)
		.map((project) => ({ value: project.key, label: project.key })),
];

export const selectValueOfProjectKey = (projectKey: string | null): string => projectKey ?? everyProjectValue;

export const projectRefOfSelectValue = (value: string): string | null => (value === everyProjectValue ? null : value);
