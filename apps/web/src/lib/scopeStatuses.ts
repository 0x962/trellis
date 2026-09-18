import type { Status } from "@trellis/api";

// Folds the status lists of several roots into one list by slug. The first
// root's status stands for every root that shares the slug, so one Done
// group covers a list over every project.
export const combineStatuses = (lists: readonly (readonly Status[])[]): Status[] => {
	const bySlug = new Map<string, Status>();
	for (const list of lists) {
		for (const status of list) {
			if (!bySlug.has(status.slug)) bySlug.set(status.slug, status);
		}
	}
	return [...bySlug.values()];
};
