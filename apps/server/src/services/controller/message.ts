import { type coordination, workItems } from "./coordination.ts";
import type { Dispatch } from "./types.ts";

export const managerMessage = (delivery: Dispatch, context: Awaited<ReturnType<typeof coordination>>) =>
	JSON.stringify({
		type: delivery.events.length === 0 ? "trellis.manager.heartbeat" : "trellis.manager.dispatch",
		id: delivery.id,
		projectId: delivery.projectId,
		generation: delivery.generation,
		events: delivery.events,
		workItems: workItems(delivery),
		...context,
	});
