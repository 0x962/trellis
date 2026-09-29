import { ORPCError } from "@orpc/server";
import type { DispatchEffects, EffectBinding } from "../../../../../langflowHost";

export function actionPermit(gate: DispatchEffects, binding: EffectBinding) {
	const recover = () => {
		try {
			return gate.recoverPermit(binding);
		} catch (error) {
			if (error instanceof Error && error.message === "dispatch_effect_binding_conflict")
				throw new ORPCError("FLOW_REQUEST_CONFLICT", {
					status: 409,
					defined: true,
					data: { requestId: binding.requestId },
				});
			throw error;
		}
	};
	const previous = recover();
	if (previous) return { permit: previous.permit, replay: true };
	try {
		return { permit: gate.acquire(binding), replay: false };
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		if (error.message === "dispatch_effect_already_reserved") {
			const reserved = recover();
			if (reserved) return { permit: reserved.permit, replay: true };
		}
		if (error.message === "dispatch_blocked")
			throw new ORPCError("FLOW_RECOVERY_BLOCKED", {
				status: 409,
				defined: true,
				data: { generation: gate.read().generation },
			});
		throw error;
	}
}
