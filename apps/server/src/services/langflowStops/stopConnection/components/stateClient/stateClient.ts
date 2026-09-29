import type { StopStateClient } from "../../../drainPendingStops";
import type { StopStateCall, StopStateInput, StopStateOperations } from "../../../stopState";

export function stopStateClient(call: StopStateCall, hostId: string): StopStateClient {
	const invoke = <K extends keyof StopStateOperations>(operation: K, input: StopStateOperations[K]["input"]) =>
		call({ operation, input, hostId } as StopStateInput) as Promise<StopStateOperations[K]["output"]>;
	return {
		pending: (input) => invoke("pending", input),
		prepare: (input) => invoke("prepare", input),
		confirm: (input) => invoke("confirm", input),
		read: (input) => invoke("read", input),
		stops: (input) => invoke("stops", input),
		settle: (input) => invoke("settle", input),
	};
}
