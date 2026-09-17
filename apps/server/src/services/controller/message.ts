import type { agentContext } from "./agentContext/index.ts";
import { type coordination, workItems } from "./coordination.ts";
import type { Dispatch } from "./types.ts";

export const managerMessage = (
	delivery: Dispatch,
	context: Awaited<ReturnType<typeof coordination>>,
	agents: Awaited<ReturnType<typeof agentContext>>,
) =>
	JSON.stringify({
		type:
			delivery.events.length === 0 && delivery.nextActions.length === 0
				? "trellis.manager.heartbeat"
				: "trellis.manager.dispatch",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: delivery.events,
		nextActions: delivery.nextActions,
		workItems: workItems(delivery),
		...context,
		agentContext: agents,
	});
