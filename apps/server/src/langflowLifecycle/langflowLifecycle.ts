import { startRepeatingCall } from "../agents/repeatingCall";
import type { JobsClock, JobsLog } from "../jobs";
import { domainQueue } from "./components/domainQueue";
import type { LangflowConnections, LangflowLifecycle } from "./types";

export async function startLangflowLifecycle(options: {
	connect(signal: AbortSignal): LangflowConnections | Promise<LangflowConnections>;
	clock: JobsClock;
	log: JobsLog;
}): Promise<LangflowLifecycle> {
	const controller = new AbortController();
	const connections = await options.connect(controller.signal);
	const queues = {
		authority: domainQueue("authority", connections.authority, options.log),
		admission: domainQueue("admission", connections.admission, options.log),
		decisions: domainQueue("decisions", connections.decisions, options.log),
		stops: domainQueue("stops", connections.stops, options.log),
		native: domainQueue("native", connections.native, options.log),
		projection: domainQueue("projection", connections.projection, options.log),
	};
	const recovery = startRepeatingCall({
		clock: options.clock,
		log: options.log,
		failureLogMessage: "Langflow recovery failed",
		call: async () => {
			for (const domain of ["stops", "authority", "admission", "native", "decisions", "projection"] as const)
				await queues[domain].recover();
		},
	});
	let stopping: Promise<void> | null = null;
	let paused = false;

	return {
		pauseOrdinary: async () => {
			if (paused || stopping !== null) throw new Error("langflow_lifecycle_unavailable");
			paused = true;
			await Promise.all(
				[queues.authority, queues.admission, queues.decisions, queues.native, queues.projection].map((queue) =>
					queue.pause(),
				),
			);
			let held = true;
			return {
				freezeStops: () => {
					if (!held) throw new Error("langflow_lifecycle_scope_released");
					return queues.stops.pause();
				},
				resume: () => {
					if (!held) throw new Error("langflow_lifecycle_scope_released");
					held = false;
					paused = false;
					for (const queue of Object.values(queues)) queue.resume();
				},
			};
		},
		committed: ({ domain, executionId }) => {
			if (stopping !== null) return;
			void queues[domain].committed(executionId);
			if (domain !== "projection") void queues.projection.committed(executionId);
		},
		stop: () => {
			if (stopping !== null) return stopping;
			const work = Object.values(queues).map((queue) => queue.stop());
			controller.abort();
			stopping = Promise.all([recovery.stop(), ...work]).then(() => undefined);
			return stopping;
		},
	};
}
