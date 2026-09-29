import { systemContext } from "../../../../context";
import type { ServiceTransport } from "../../../../db/transport";
import type { NativeRuntimePort, RuntimeStateInput, RuntimeStateOperations } from "../contracts";

export function nativeRuntimeTransport(transport: ServiceTransport, hostId: string): NativeRuntimePort {
	const call = (name: string, input: unknown) =>
		transport.call(name as Parameters<ServiceTransport["call"]>[0], systemContext(), input);
	return {
		state: <K extends keyof RuntimeStateOperations>(operation: K, input: RuntimeStateOperations[K]["input"]) =>
			call("langflowNative.runtimeState", { hostId, operation, input } as RuntimeStateInput) as Promise<
				RuntimeStateOperations[K]["output"]
			>,
		observe: async (input) => {
			await call("langflowNative.runtimeObserve", { hostId, ...input });
		},
		recover: async (input) => {
			await call("langflowNative.runtimeRecover", { hostId, ...input });
		},
		acknowledge: async (input) => {
			await call("langflowNative.runtimeAcknowledge", { hostId, ...input });
		},
	};
}
