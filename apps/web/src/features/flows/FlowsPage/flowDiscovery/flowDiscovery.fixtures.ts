import { legacyDocumentV1Example, pendingDocumentV1Example, publishedDocumentV1Example } from "@trellis/api";
import type { FlowSettingsState } from "../../FlowEditor/components/FlowSettingsSheet/flowSettingsState";
import type { FlowDiscoveryEntry, FlowDiscoveryFilters, FlowDiscoveryInput } from "./flowDiscovery";

export const preservedFlowFilters: FlowDiscoveryFilters = { query: "review", project: "TRL" };
export const pendingDiscoveryEntry: FlowDiscoveryEntry = {
	document: pendingDocumentV1Example,
	compatibility: { state: "compatible" },
	capabilities: {
		edit: { state: "allowed" },
		delete: { state: "allowed" },
		convert: { state: "blocked", reason: "The flow already uses Langflow." },
		start: { state: "blocked", reason: "The saved version awaits publication." },
	},
};
export const publishedDiscoveryEntry: FlowDiscoveryEntry = {
	...pendingDiscoveryEntry,
	document: publishedDocumentV1Example,
	capabilities: { ...pendingDiscoveryEntry.capabilities, start: { state: "allowed" } },
};
export const blockedDiscoveryEntry: FlowDiscoveryEntry = {
	...pendingDiscoveryEntry,
	document: legacyDocumentV1Example,
	compatibility: {
		state: "blocked",
		diagnostics: [
			{
				code: "UNSUPPORTED_COMPONENT",
				message: "The converter cannot preserve this component.",
				severity: "error",
				path: ["nodes", 0],
			},
		],
	},
	capabilities: {
		edit: { state: "allowed" },
		delete: { state: "allowed" },
		convert: { state: "blocked", reason: "The converter cannot preserve this component." },
		start: { state: "unknown", reason: "The service must confirm run capability." },
	},
};
export const discoveryFixture: FlowDiscoveryInput = {
	filters: preservedFlowFilters,
	load: { state: "loaded", entries: [pendingDiscoveryEntry] },
	engine: { state: "available" },
};
export const settingsFixture: FlowSettingsState = {
	flow: pendingDocumentV1Example.flow,
	draft: { ...pendingDocumentV1Example.flow, name: "My review", slug: "my-review" },
	filters: preservedFlowFilters,
	result: { state: "editing" },
};
export const metadataConflictFixture: FlowSettingsState = {
	...settingsFixture,
	result: { state: "conflict", serverVersion: 3 },
};
export const deletedFlowFixture: FlowSettingsState = { ...settingsFixture, result: { state: "deleted" } };
export const stalePublicationFixture = pendingDocumentV1Example.lastExecutablePublication!;
