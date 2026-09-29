import type { FlowDiagnosticV1, FlowPublicationStateV1, FlowPublicationV1 } from "@trellis/api";

export type {
	FlowCapabilityV1 as DiscoveryCapability,
	FlowCompatibilityV1 as DiscoveryCompatibility,
	FlowDiscoveryEntryV1 as DiscoverySummary,
	FlowDiscoveryV1 as DiscoveryResult,
	FlowEngineAvailabilityV1 as DiscoveryAvailability,
} from "@trellis/api";

export type DiscoveryStoredFacts = {
	flowId: string;
	currentRevision: number | null;
	latestRevision: number | null;
	engine: "legacy" | "langflow" | null;
	documentHash: string | null;
	componentManifestHash: string | null;
	diagnostics: FlowDiagnosticV1[] | null;
	nodeCount: number | null;
	edgeCount: number | null;
	publication: FlowPublicationV1 | null;
	publicationState: FlowPublicationStateV1 | null;
	lastExecutablePublication: FlowPublicationV1 | null;
	conversionState: "converted" | "blocked" | "approved" | "activated" | null;
	conversionDiagnostics: FlowDiagnosticV1[] | null;
};
