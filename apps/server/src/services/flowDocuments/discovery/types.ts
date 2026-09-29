import type { FlowDiagnosticV1, FlowPublicationStateV1, FlowPublicationV1, FlowSummary } from "@trellis/api";

export type DiscoveryAvailability =
	| { state: "available"; observedAt: string; enginePackageDigest: string; componentManifestHash: string }
	| { state: "unavailable" | "unknown"; observedAt: string | null; reason: string };

export type DiscoveryCapability = { state: "allowed" } | { state: "blocked" | "unknown"; reason: string };
export type DiscoveryCompatibility =
	| { state: "compatible" }
	| { state: "needs_migration" | "blocked" | "unknown"; diagnostics: FlowDiagnosticV1[] };

export type DiscoverySummary = {
	flow: FlowSummary;
	engine: "legacy" | "langflow";
	revision: number;
	documentHash: string | null;
	componentManifestHash: string | null;
	diagnostics: FlowDiagnosticV1[];
	publication: FlowPublicationStateV1;
	lastExecutablePublication: FlowPublicationV1 | null;
	compatibility: DiscoveryCompatibility;
	capabilities: Record<"edit" | "delete" | "convert" | "start", DiscoveryCapability>;
};

export type DiscoveryResult = { engine: DiscoveryAvailability; entries: DiscoverySummary[] };

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
