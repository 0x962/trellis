import { join } from "node:path";
import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import { createEngineClient, type DispatchReceiptArchive, type LangflowSupervisor } from "../../langflowHost";
import type { NativeReservationTransport } from "../../routes/langflow-native-reservations";
import type { nativeReservationState } from "../../services/langflowDispatch/nativeReservationState";
import { readNativeVisit } from "../../services/langflowNative";

export function nativeReservations(options: {
	home: string;
	transport: ServiceTransport;
	supervisor: Pick<LangflowSupervisor, "withAuthenticatedNativeReservation">;
	archive: Pick<DispatchReceiptArchive, "readAuthorityBytes">;
}) {
	const controller = new AbortController();
	const active = new Set<Promise<string>>();
	let stopped = false;
	const transport: NativeReservationTransport = {
		reserve: (input) => {
			if (stopped) return Promise.reject(new Error("langflow_runtime_stopping"));
			const work = options.supervisor.withAuthenticatedNativeReservation(input.authorization, async (observation) => {
				const state = await options.transport.call("langflowNative.reservationState", systemContext(), {
					requestBytes: input.requestBytes, capabilityId: input.capabilityId, observation,
				}) as Awaited<ReturnType<typeof nativeReservationState>>;
				if (state.request.state === "reserved") return JSON.stringify(state.request.handle);
				if (state.request.cancelIntent !== null) throw new Error("execution_canceled");
				const client = createEngineClient({
					endpoint: observation.endpoint,
					authenticationFile: join(options.home, "langflow", "secrets", `${observation.identity.instanceId}.token`),
				});
				const visit = await readNativeVisit(client, {
					requestBytes: input.requestBytes,
					authorityBytes: options.archive.readAuthorityBytes(state.authority),
					capabilityId: input.capabilityId,
					signal: controller.signal,
				});
				return options.transport.call("langflowNative.reserve", systemContext(), {
					requestBytes: input.requestBytes, capabilityId: input.capabilityId,
					observation, authority: state.authority, visit,
				}) as Promise<string>;
			});
			active.add(work);
			void work.finally(() => active.delete(work)).catch(() => undefined);
			return work;
		},
	};
	return {
		transport,
		stop: async () => {
			stopped = true;
			controller.abort();
			await Promise.allSettled([...active]);
		},
	};
}
