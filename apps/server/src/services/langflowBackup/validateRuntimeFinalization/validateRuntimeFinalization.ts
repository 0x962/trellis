import { parseRuntimeFinalization } from "../parseRuntimeFinalization";

export function validateRuntimeFinalization(request: unknown, value: unknown) {
	const finalization = parseRuntimeFinalization(request, value);
	if (finalization.receipt.outcome !== "committed")
		throw new Error("paired_runtime_finalization_mismatch");
	return finalization;
}
