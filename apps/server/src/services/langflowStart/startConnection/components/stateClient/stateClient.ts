import type { StartRepository, StartStateCall, StartStateInput, StartStateOperations } from "../../../startState";

export function stateClient(call: StartStateCall, hostId: string) {
	const invoke = <K extends keyof StartStateOperations>(operation: K, input: StartStateOperations[K]["input"]) =>
		call({ operation, input, hostId } as StartStateInput) as Promise<StartStateOperations[K]["output"]>;
	const repository: StartRepository = {
		read: (input) => invoke("read", input),
		markUnknown: (input) => invoke("markUnknown", input),
		bind: (input) => invoke("bind", input),
		open: ({ executionId }) => invoke("open", { executionId }),
		confirm: async (input) => {
			await invoke("confirm", input);
		},
	};
	return {
		repository,
		bindCancellation: (input: StartStateOperations["bindCancellation"]["input"]) => invoke("bindCancellation", input),
		restoreInitial: (input: StartStateOperations["restoreInitial"]["input"]) => invoke("restoreInitial", input),
		pending: (afterId: string) => invoke("pending", { afterId }),
		cancellationProof: (executionId: string) => invoke("cancellationProof", { executionId }),
		admissionBytes: (executionId: string) => invoke("admissionBytes", { executionId }),
	};
}
