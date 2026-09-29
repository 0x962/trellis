import type { FlowDiagnosticV1, FlowSummary } from "@trellis/api";
import type { DiscoveryAvailability, DiscoveryCapability, DiscoveryStoredFacts, DiscoverySummary } from "./types.ts";

const diagnostic = (code: string, message: string): FlowDiagnosticV1 => ({
	code,
	message,
	severity: "error",
	path: [],
});
const blocked = (reason: string): DiscoveryCapability => ({ state: "blocked", reason });
const unknown = (reason: string): DiscoveryCapability => ({ state: "unknown", reason });

export const summarize = (
	flow: FlowSummary,
	facts: DiscoveryStoredFacts,
	availability: DiscoveryAvailability,
	hasActor: boolean,
): DiscoverySummary => {
	const engine = facts.engine ?? "legacy";
	const missingRevision = facts.latestRevision !== null && facts.currentRevision === null;
	const diagnostics = [...(facts.diagnostics ?? [])];
	if (missingRevision)
		diagnostics.push(diagnostic("document_revision_missing", "The current saved document is unavailable."));
	const publication: DiscoverySummary["publication"] =
		facts.publication !== null
			? { state: "published", revision: flow.version, publication: facts.publication }
			: (facts.publicationState ?? { state: "not_requested", revision: flow.version });
	if (publication.state === "blocked" || publication.state === "failed") diagnostics.push(...publication.diagnostics);
	let compatibility: DiscoverySummary["compatibility"];
	if (missingRevision || diagnostics.some((item) => item.severity === "error")) {
		compatibility = { state: "blocked", diagnostics };
	} else if (engine === "legacy") {
		compatibility = {
			state: facts.conversionState === "blocked" ? "blocked" : "needs_migration",
			diagnostics: facts.conversionDiagnostics ?? [],
		};
	} else if (availability.state !== "available") {
		compatibility = {
			state: "unknown",
			diagnostics: [diagnostic("engine_unobserved", availability.reason)],
		};
	} else if (facts.componentManifestHash !== availability.componentManifestHash) {
		compatibility = {
			state: "blocked",
			diagnostics: [
				diagnostic("publication_manifest_mismatch", "The saved document uses a different component catalog."),
			],
		};
	} else if (publication.state !== "published") {
		compatibility = { state: "unknown", diagnostics: [] };
	} else if (publication.publication.enginePackageDigest !== availability.enginePackageDigest) {
		compatibility = {
			state: "blocked",
			diagnostics: [diagnostic("publication_package_mismatch", "The publication uses a different engine package.")],
		};
	} else {
		compatibility = { state: "compatible" };
	}
	const mutation: DiscoveryCapability = hasActor ? { state: "allowed" } : blocked("An actor is required.");
	let start: DiscoveryCapability;
	if (!hasActor) start = mutation;
	else if (engine === "legacy") start = unknown("The legacy execution authority is not part of this observation.");
	else if (missingRevision || publication.state !== "published") start = blocked("Publish the current saved revision.");
	else if (availability.state !== "available")
		start = availability.state === "unknown" ? unknown(availability.reason) : blocked(availability.reason);
	else if (compatibility.state !== "compatible")
		start = blocked("The publication is not compatible with the current engine.");
	else start = { state: "allowed" };
	return {
		flow: {
			...flow,
			nodeCount: facts.nodeCount ?? flow.nodeCount,
			edgeCount: facts.edgeCount ?? flow.edgeCount,
		},
		engine,
		revision: flow.version,
		documentHash: facts.documentHash,
		componentManifestHash: facts.componentManifestHash,
		diagnostics,
		publication,
		lastExecutablePublication: engine === "langflow" ? facts.lastExecutablePublication : null,
		compatibility,
		capabilities: {
			edit: missingRevision ? blocked("The current saved document is unavailable.") : mutation,
			delete: mutation,
			convert: !hasActor
				? mutation
				: engine === "langflow"
					? blocked("This document already uses Langflow.")
					: facts.conversionState === "blocked"
						? blocked("The retained conversion report contains unresolved requirements.")
						: unknown("An accepted conversion mapping has not been established."),
			start,
		},
	};
};
