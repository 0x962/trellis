import { useQueries, useQuery } from "@tanstack/react-query";
import type { Status } from "@trellis/api";
import { useMemo } from "react";
import { useApp } from "../../lib/appContext";
import { combineStatuses } from "../../lib/scopeStatuses";

const none: Status[] = [];

const combineResults = (results: readonly { data?: { statuses: Status[] } }[]) =>
	combineStatuses(results.map((result) => result.data?.statuses ?? none));

// The statuses a list can filter by and group by. A project route takes
// its project's effective set. /all takes every root's set, folded by
// slug: the first root's status stands for every root that shares the
// slug, so one Done group covers the whole list.
export const useScopeStatuses = (project?: string): Status[] => {
	const { orpc } = useApp();
	const own = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: project === undefined });
	const roots = useMemo(
		() => (projects.data ?? []).filter((entry) => entry.parentId === null).map((entry) => entry.path),
		[projects.data],
	);
	const statuses = useQueries({
		queries: roots.map((root) => orpc.statuses.list.queryOptions({ input: { project: root } })),
		combine: combineResults,
	});
	return project === undefined ? statuses : (own.data?.statuses ?? none);
};
