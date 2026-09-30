import type { LiveOwnership } from "../contracts";
import type { LangflowSupervisor } from "../supervisor";

export type HeldEngineScope = {
	observation: LiveOwnership;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
};

export function withHeldEngine<T>(
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">,
	operation: (scope: HeldEngineScope) => Promise<T>,
): Promise<T> {
	return supervisor.withHealthyEngine(async (observation) => {
		const retained = structuredClone(observation);
		const pending = new Set<Promise<unknown>>();
		let active = true;
		const held: HeldEngineScope["supervisor"] = {
			withHealthyEngine<R>(callback: (current: LiveOwnership) => Promise<R>): Promise<R> {
				if (!active) return Promise.reject(new Error("held_engine_scope_closed"));
				const result = Promise.resolve().then(() => callback(structuredClone(retained)));
				pending.add(result);
				void result.then(
					() => pending.delete(result),
					() => pending.delete(result),
				);
				return result;
			},
		};
		try {
			return await operation({ observation: structuredClone(retained), supervisor: held });
		} finally {
			active = false;
			await Promise.allSettled(pending);
		}
	});
}
