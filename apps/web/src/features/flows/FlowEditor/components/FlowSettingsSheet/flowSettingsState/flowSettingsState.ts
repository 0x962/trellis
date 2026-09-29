import type { Flow, FlowUpdateInput } from "@trellis/api";
import type { FlowDiscoveryFilters } from "../../../../FlowsPage/flowDiscovery";

export type FlowMetadataDraft = Pick<Flow, "name" | "slug" | "description" | "briefing" | "project" | "harness">;
export type FlowSettingsState = {
	flow: Flow;
	draft: FlowMetadataDraft;
	filters: FlowDiscoveryFilters;
	result:
		| { state: "editing" }
		| { state: "conflict"; serverVersion: number }
		| { state: "failed"; message: string }
		| { state: "deleted" };
};
export type FlowSettingsEvent =
	| { type: "edit"; draft: FlowMetadataDraft }
	| { type: "conflict"; serverVersion: number }
	| { type: "failed"; message: string }
	| { type: "deleted" };
export type FlowMetadataRequest = FlowUpdateInput & { expectedVersion: number };

export function flowSettingsState(state: FlowSettingsState, event: FlowSettingsEvent): FlowSettingsState {
	switch (event.type) {
		case "edit":
			return { ...state, draft: event.draft };
		case "conflict":
			return { ...state, result: { state: "conflict", serverVersion: event.serverVersion } };
		case "failed":
			return { ...state, result: { state: "failed", message: event.message } };
		case "deleted":
			return { ...state, result: { state: "deleted" } };
	}
}
