import { flowProjectLabel, type ProjectSummary } from "@trellis/api";

// The value the project select carries for a flow that applies to every
// project. A project key holds upper-case letters and digits only, so no key
// can take this value.
export const everyProjectValue = "every";

// The items of the project select. A flow belongs to the root project of a
// tree, which is the rule `resolveRootProjectId` in
// `apps/server/src/services/flows/flows.ts` states, so the list holds one
// item per root and no sub-project. An archived project takes no new work,
// so it holds no item either. `path` of a root is its key, such as `TRL`.
export const flowProjectItems = (projects: ProjectSummary[]) => [
	{ value: everyProjectValue, label: flowProjectLabel({ project: null }) },
	...projects
		.filter((project) => project.id === project.rootId && project.archivedAt === null)
		.map((project) => ({ value: project.path, label: project.path })),
];

export const selectValueOfProjectKey = (projectKey: string | null): string => projectKey ?? everyProjectValue;

export const projectRefOfSelectValue = (value: string): string | null => (value === everyProjectValue ? null : value);
