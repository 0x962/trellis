import { ORPCError } from "@orpc/client";
import type { FlowSettingsState } from "../flowSettingsState";

export function flowSettingsFailure(error: Error): FlowSettingsState["result"] {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") return { state: "deleted" };
	if (error instanceof ORPCError && error.code === "FLOW_VERSION_CONFLICT")
		return { state: "conflict", serverVersion: error.data.version };
	return { state: "failed", message: error.message };
}
