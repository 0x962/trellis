import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { HostReconciliationInput, HostReconciliationResult } from "../../langflowHost";

export function reconciliationTransport(transport: Pick<ServiceTransport, "call">) {
	return {
		reconcileHostControl: (input: HostReconciliationInput): Promise<HostReconciliationResult> =>
			transport.call("langflowHost.reconcile", systemContext(), input) as Promise<HostReconciliationResult>,
	};
}
