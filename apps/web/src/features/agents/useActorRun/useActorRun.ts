import { useQuery } from "@tanstack/react-query";
import type { ActorRef } from "@trellis/api";
import { useApp } from "../../../lib/appContext";

export function useActorRun(actor: ActorRef) {
	const { orpc } = useApp();
	const run = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: {} }),
		enabled: actor.kind === "agent",
		select: (items) => items.find((item) => item.id === actor.name),
	});
	return run.data;
}
