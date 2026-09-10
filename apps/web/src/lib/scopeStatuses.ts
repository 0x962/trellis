import type { Status } from "@trellis/api";
import type { AppContext } from "./appContext";

// Folds the status lists of several roots into one list by slug. The first
// root's status stands for every root that shares the slug, so one Done
// group covers the whole /all list.
export const combineStatuses = (lists: readonly (readonly Status[])[]): Status[] => {
	const bySlug = new Map<string, Status>();
	for (const list of lists) {
		for (const status of list) {
			if (!bySlug.has(status.slug)) bySlug.set(status.slug, status);
		}
	}
	return [...bySlug.values()];
};

// The statuses of a route's scope, for a loader. It reads the cache entries
// that useScopeStatuses reads, in the same order, so a query key built in
// the loader equals the key the component builds on its first render.
export const loadScopeStatuses = async ({ queryClient, orpc }: AppContext, project?: string): Promise<Status[]> => {
	if (project !== undefined) {
		const own = await queryClient.ensureQueryData(orpc.projects.get.queryOptions({ input: { project } }));
		return own.statuses;
	}
	const projects = await queryClient.ensureQueryData(orpc.projects.list.queryOptions({ input: {} }));
	const roots = projects.filter((entry) => entry.parentId === null).map((entry) => entry.path);
	const lists = await Promise.all(
		roots.map((root) => queryClient.ensureQueryData(orpc.statuses.list.queryOptions({ input: { project: root } }))),
	);
	return combineStatuses(lists.map((list) => list.statuses));
};
