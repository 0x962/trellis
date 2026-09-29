import type { NativeResultV1 } from "../../../langflowContracts";

export function nativeGateDecision(result: Pick<NativeResultV1, "output" | "exitKind">): "yes" | "no" | "unknown" {
	if (result.exitKind !== "completed") return "unknown";
	const answer = result.output.trim().toLowerCase();
	return answer === "yes" || answer === "no" ? answer : "unknown";
}
