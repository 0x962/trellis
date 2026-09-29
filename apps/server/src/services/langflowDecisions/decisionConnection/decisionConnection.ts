import { systemContext } from "../../../context";
import type { ServiceTransport } from "../../../db/transport";
import type { JobsLog } from "../../../jobs";
import {
	createEngineClient,
	type DispatchEffects,
	type DispatchReceiptArchive,
	type EngineClientOptions,
	type LangflowSupervisor,
} from "../../../langflowHost";
import type { DecisionStateOperations } from "../decisionState";
import { dispatchDecision } from "./components/dispatchDecision";

export type DecisionConnectionDependencies = {
	transport: Pick<ServiceTransport, "call">;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
	engineTransport: Omit<EngineClientOptions, "endpoint">;
	gate: Pick<DispatchEffects, "read" | "recoverPermit" | "acquire" | "settle">;
	archive: Pick<DispatchReceiptArchive, "readAuthorityBytes" | "writeTerminal">;
	signal: AbortSignal;
	log: JobsLog;
};

export function decisionConnection(deps: DecisionConnectionDependencies) {
	const call = <K extends keyof DecisionStateOperations>(
		operation: K,
		input: Parameters<DecisionStateOperations[K]>[0],
	) =>
		deps.transport.call("langflowDecisions.state", systemContext(), { operation, input }) as ReturnType<
			DecisionStateOperations[K]
		>;
	const state: DecisionStateOperations = {
		page: (input) => call("page", input),
		read: (input) => call("read", input),
		prepare: (input) => call("prepare", input),
		authorize: (input) => call("authorize", input),
		acknowledge: (input) => call("acknowledge", input),
	};
	async function drain(executionId?: string) {
		let after: { executionId: string; decisionId: string } | null = null;
		while (!deps.signal.aborted) {
			const page = await state.page({ executionId, after });
			if (page.length === 0) return;
			for (const key of page) {
				if (deps.signal.aborted) return;
				try {
					await dispatchDecision(state, key, deps, (observation) =>
						createEngineClient({ ...deps.engineTransport, endpoint: observation.endpoint }),
					);
				} catch {
					deps.log("Human decision recovery remains pending", key);
				}
				after = key;
			}
		}
	}
	return {
		committed: ({ executionId }: { executionId: string }) => drain(executionId),
		recover: () => drain(),
	};
}
