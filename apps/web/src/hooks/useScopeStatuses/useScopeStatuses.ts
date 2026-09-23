import { useQueries, useQuery } from "@tanstack/react-query";
import type { Status } from "@trellis/api";
import { useMemo } from "react";
import { useApp } from "../../lib/appContext";
import { combineStatuses } from "../../lib/scopeStatuses";

const none: Status[] = [];

type StatusResult = { data?: { statuses: Status[] } };

type Combine = (results: readonly StatusResult[]) => Status[];

const foldBySlug: Combine = (results) => combineStatuses(results.map((result) => result.data?.statuses ?? none));

const everyStatus: Combine = (results) => results.flatMap((result) => result.data?.statuses ?? none);

// The statuses of a scope, under one `combine` over the project lists. A
// named project takes its own set. `combine` is a module constant, so the
// results stay memoized.
const useStatusesOfScope = (project: string | undefined, combine: Combine): Status[] => {
	const { orpc } = useApp();
	const own = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: project === undefined });
	const keys = useMemo(() => (projects.data ?? []).map((entry) => entry.key), [projects.data]);
	const statuses = useQueries({
		queries: keys.map((key) => orpc.statuses.list.queryOptions({ input: { project: key } })),
		combine,
	});
	return project === undefined ? statuses : (own.data?.statuses ?? none);
};

// The statuses a list can filter by and group by. A named project takes its
// own set. No project takes every project's set, folded by slug: the first
// project's status stands for every project that shares the slug, so one
// Done group covers the whole list.
export const useScopeStatuses = (project?: string): Status[] => useStatusesOfScope(project, foldBySlug);

// Every status of the scope, with no fold by slug. Each project owns its own
// Done status with its own id, so a count over a whole category reads the
// ids of every project and not the ids of the first one.
export const useScopeStatusesAll = (project?: string): Status[] => useStatusesOfScope(project, everyStatus);
