import type { FlowDiagnosticV1, FlowDocumentV1 } from "@trellis/api";

export type FlowCapability = { state: "allowed" } | { state: "blocked" | "unknown"; reason: string };
export type FlowDiscoveryEntry = {
	document: FlowDocumentV1;
	compatibility:
		| { state: "compatible" }
		| { state: "needs_migration" | "blocked" | "unknown"; diagnostics: FlowDiagnosticV1[] };
	capabilities: Record<"edit" | "delete" | "convert" | "start", FlowCapability>;
};
export type FlowDiscoveryFilters = { query: string; project: string | null };
export type FlowDiscoveryInput = {
	filters: FlowDiscoveryFilters;
	load:
		| { state: "loading" }
		| { state: "failed"; message: string }
		| { state: "loaded"; entries: FlowDiscoveryEntry[] };
	engine: { state: "available" } | { state: "unavailable"; reason: string };
};

export function flowDiscovery(input: FlowDiscoveryInput) {
	const { filters, load, engine } = input;
	if (load.state !== "loaded") return { ...load, filters, engine };
	const query = filters.query.trim().toLowerCase();
	const entries = load.entries.filter(({ document: { flow } }) => {
		const scopeMatches = filters.project === null || flow.project === null || flow.project === filters.project;
		return scopeMatches && `${flow.name} ${flow.description}`.toLowerCase().includes(query);
	});
	const state = load.entries.length === 0 ? "empty" : entries.length === 0 ? "no_matches" : "populated";
	return { state, filters, engine, entries } as const;
}
