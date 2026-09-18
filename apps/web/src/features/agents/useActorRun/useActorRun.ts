import { useQuery } from "@tanstack/react-query";
import type { ActorRef } from "@trellis/api";
import { useApp } from "../../../lib/appContext";

export function useActorRun(actor: ActorRef) {
	const { orpc } = useApp();
	const run = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [actor.name] } }),
		enabled: actor.kind === "agent",
		refetchInterval: (query) => (query.state.data?.some((item) => item.assigned) ? 2000 : false),
		select: (items) => items.find((item) => item.id === actor.name),
	});
	return run.data;
}
