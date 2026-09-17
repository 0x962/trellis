import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { workingTargets } from "../workingTargets";

const empty = { ticketIds: [] as string[], projectIds: [] as string[], runIds: [] as string[] };

export function useWorkingAgents() {
	const { orpc } = useApp();
	const query = useQuery({ ...orpc.agentRuns.list.queryOptions({ input: {} }), select: workingTargets });
	const [held, setHeld] = useState(empty);
	useEffect(() => {
		if (query.data !== undefined) setHeld(query.data);
	}, [query.data]);
	// A failed reload keeps the last work set, so active cards keep their
	// glimmer and column position.
	if (query.error !== null) return { ...(query.data ?? held), failed: true };
	return { ...(query.data ?? empty), failed: false };
}
