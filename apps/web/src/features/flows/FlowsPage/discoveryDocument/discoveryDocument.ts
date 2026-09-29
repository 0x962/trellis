import type { FlowDocumentV1 } from "@trellis/api";
import type { FlowDiscoveryEntry } from "../flowDiscovery";

export function discoveryDocument(document: FlowDocumentV1): FlowDiscoveryEntry {
	return {
		document,
		compatibility: { state: "unknown", diagnostics: [] },
		capabilities: {
			edit: { state: "allowed" },
			delete: { state: "allowed" },
			convert: { state: "unknown", reason: "Conversion availability has not been reported." },
			start:
				document.engine === "langflow" && document.publication.state !== "published"
					? { state: "blocked", reason: "The saved version needs a publication before a new run." }
					: { state: "unknown", reason: "Run availability is checked when you start a run." },
		},
	};
}
