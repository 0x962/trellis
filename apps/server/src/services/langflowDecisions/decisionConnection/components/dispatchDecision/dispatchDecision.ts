import {
	type DecisionLookupRequestV1,
	DecisionLookupResultV1Schema,
	protocolDigest,
} from "../../../../../langflowContracts";
import type { createEngineClient, DispatchPermit, LiveOwnership } from "../../../../../langflowHost";
import { acceptance } from "../../../acceptance";
import { decisionEngine } from "../../../decisionEngine";
import type { DecisionStateOperations } from "../../../decisionState";
import { deliver } from "../../../deliver";
import type { DecisionConnectionDependencies } from "../../decisionConnection";

export async function dispatchDecision(
	state: DecisionStateOperations,
	key: { executionId: string; decisionId: string },
	deps: DecisionConnectionDependencies,
	client: (observation: LiveOwnership) => ReturnType<typeof createEngineClient>,
) {
	const { stored } = await state.read(key);
	const binding = {
		effectId: JSON.stringify(["decision-delivery", key.executionId, key.decisionId]),
		kind: "engine-delivery" as const,
		executionId: key.executionId,
		attemptId: null,
		jobId: stored.engineJobId,
		requestId: key.decisionId,
		payloadDigest: stored.delivery.payloadDigest,
	};
	const prior = deps.gate.recoverPermit(binding);
	if (prior?.terminal) return;
	let permit = prior?.permit;
	async function settle(held: DispatchPermit, sourceBytes: string) {
		const receipt = deps.archive.writeTerminal({
			permit: held,
			outcome: "completed",
			sourceBytes,
			sourceDigest: protocolDigest(sourceBytes),
		});
		await deps.gate.settle(held, receipt.id);
	}
	if (stored.delivery.state === "confirmed") {
		if (permit) await settle(permit, JSON.stringify(stored.delivery.acceptance));
		return;
	}
	await deps.supervisor.withHealthyEngine(async (observation) => {
		if (deps.gate.read().dataHomeId !== observation.identity.dataHomeId)
			throw new Error("decision_dispatch_home_conflict");
		const engine = decisionEngine(client(observation), {
			signal: deps.signal,
			archive: deps.archive,
			async beforeAccept(request) {
				if (deps.gate.read().block) throw new Error("dispatch_blocked");
				if (
					request.authority.ownerId !== observation.identity.ownerId ||
					request.authority.hostId !== observation.identity.hostId
				)
					throw new Error("authority_conflict");
				await state.authorize({ ...key, authority: request.authority });
				deps.signal.throwIfAborted();
				if (deps.gate.read().block) throw new Error("dispatch_blocked");
				permit ??= deps.gate.acquire(binding);
			},
		});
		const lookup: DecisionLookupRequestV1 = {
			version: 1,
			...key,
			engineJobId: stored.engineJobId,
			engineRequestId: stored.engineRequestId,
			payloadDigest: stored.delivery.payloadDigest,
		};
		let response: unknown;
		try {
			response = await engine.lookup(lookup);
		} catch {
			deps.log("Human decision lookup acknowledgement is unknown", key);
			response = { state: "unknown", lookup };
		}
		let delivery = acceptance(stored.delivery, lookup, response);
		if (DecisionLookupResultV1Schema.parse(response).state === "absent") {
			const current = await state.read(key);
			if (current.canceled || current.authority === null || deps.gate.read().block) return;
			if (
				current.authority.ownerId !== observation.identity.ownerId ||
				current.authority.hostId !== observation.identity.hostId
			)
				throw new Error("authority_conflict");
			const prepared = await state.prepare({ ...key, authority: current.authority });
			if (prepared === null) return;
			delivery = await deliver(prepared, engine, deps.log);
		}
		const saved = await state.acknowledge({ ...key, delivery });
		if (saved.state === "confirmed" && permit) await settle(permit, JSON.stringify(saved.acceptance));
	});
}
