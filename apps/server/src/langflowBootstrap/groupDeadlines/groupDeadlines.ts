import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { EngineClientOptions, LangflowSupervisor, LiveOwnership } from "../../langflowHost";
import { deadlineHandler, type GroupDeadlineResult, groupScopeReader } from "../../services/langflowClocks";

export function groupDeadlines(options: {
	home: string;
	transport: ServiceTransport;
	supervisor: Pick<LangflowSupervisor, "withAuthenticatedNativeReservation">;
	engineDependencies?: EngineClientOptions["dependencies"];
}) {
	const controller = new AbortController();
	const active = new Set<Promise<Response>>();
	let stopped = false;
	return {
		handle: (request: Request) => {
			if (stopped) return Promise.reject(new Error("langflow_runtime_stopping"));
			let observation: LiveOwnership;
			let read: ReturnType<typeof groupScopeReader>;
			const handler = deadlineHandler({
				withAuthenticatedNativeReservation: (authorization, action) =>
					options.supervisor.withAuthenticatedNativeReservation(authorization, async (current) => {
						observation = current;
						read = groupScopeReader({
							endpoint: current.endpoint,
							authenticationFile: join(options.home, "langflow", "secrets", `${current.identity.instanceId}.token`),
							dependencies: options.engineDependencies,
						});
						return action();
					}),
				readGroupScope: (input, capabilityId, signal) =>
					read(input, capabilityId, AbortSignal.any([signal, controller.signal])),
				reserve: (input) =>
					options.transport.call("langflowClocks.reserveGroupDeadline", systemContext(), {
						...input,
						observation,
					}) as Promise<GroupDeadlineResult>,
			});
			const work = handler(request).catch((error: unknown) => {
				if (error instanceof Error && error.message === "authentication_denied")
					throw new ORPCError("UNAUTHORIZED", { status: 401 });
				throw error;
			});
			active.add(work);
			void work.finally(() => active.delete(work)).catch(() => undefined);
			return work;
		},
		stop: async () => {
			stopped = true;
			controller.abort();
			await Promise.allSettled([...active]);
		},
	};
}
