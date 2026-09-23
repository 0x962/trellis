import { useQuery } from "@tanstack/react-query";
import type { Status } from "@trellis/api";
import { useCallback } from "react";
import { useApp } from "../../../../lib/appContext";

// The effective statuses of the project a ticket sits in, in position
// order. Every picker and every review action reads this one query.
export const useStatuses = (projectKey: string) => {
	const { orpc } = useApp();
	const query = useQuery(orpc.statuses.list.queryOptions({ input: { project: projectKey } }));
	return query.data?.statuses ?? [];
};

// The same statuses for an action that may run before the query lands:
// a key pressed the moment the button appears.
export const useEnsureStatuses = (projectKey: string) => {
	const { orpc, queryClient } = useApp();
	return useCallback(
		async (): Promise<Status[]> =>
			(await queryClient.ensureQueryData(orpc.statuses.list.queryOptions({ input: { project: projectKey } }))).statuses,
		[orpc, queryClient, projectKey],
	);
};
