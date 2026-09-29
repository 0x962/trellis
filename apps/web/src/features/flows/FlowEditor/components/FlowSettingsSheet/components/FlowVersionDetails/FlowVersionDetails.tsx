import { PropertyRow } from "@trellis/ui";
import type { FlowDiscoveryEntry } from "../../../../../FlowsPage/flowDiscovery";

const publicationLabels = {
	not_requested: "Not requested",
	pending: "Pending",
	failed: "Failed",
	blocked: "Blocked",
	published: "Published",
};
const compatibilityLabels = {
	compatible: "Compatible",
	needs_migration: "Needs migration",
	blocked: "Conversion blocked",
	unknown: "Compatibility unknown",
};

export function FlowVersionDetails({ entry }: { entry: FlowDiscoveryEntry }) {
	const { document, compatibility, capabilities } = entry;
	const diagnostics = [
		...document.diagnostics,
		...(compatibility.state === "compatible" ? [] : compatibility.diagnostics),
		...(document.publication.state === "failed" || document.publication.state === "blocked"
			? document.publication.diagnostics
			: []),
	];
	return (
		<div className="w-full min-w-0 text-sm">
			<dl>
				<PropertyRow label="Engine">{document.engine === "legacy" ? "Legacy" : "Langflow"}</PropertyRow>
				<PropertyRow label="Saved version">
					<span className="tabular-nums">{document.revision}</span>
				</PropertyRow>
				<PropertyRow label="Executable">
					<span className="tabular-nums">{document.lastExecutablePublication?.revision ?? "None"}</span>
				</PropertyRow>
				<PropertyRow label="Publication">{publicationLabels[document.publication.state]}</PropertyRow>
				<PropertyRow label="Compatibility">{compatibilityLabels[compatibility.state]}</PropertyRow>
			</dl>
			{document.lastExecutablePublication !== null &&
				document.lastExecutablePublication.revision !== document.revision && (
					<p className="text-xs text-fg-muted">The older executable revision does not permit a new run.</p>
				)}
			{[...new Map(diagnostics.map((diagnostic) => [JSON.stringify(diagnostic), diagnostic])).values()].map(
				(diagnostic) => (
					<p key={JSON.stringify(diagnostic)} className="break-words text-xs text-fg-muted">
						{diagnostic.severity}: {diagnostic.code}: {diagnostic.message}
						{diagnostic.path.length > 0 && ` (${diagnostic.path.join(" / ")})`}
					</p>
				),
			)}
			{Object.entries(capabilities).map(([action, capability]) =>
				capability.state === "allowed" ? null : (
					<p key={action} className="break-words text-xs text-fg-muted">
						{action}: {capability.state === "unknown" ? "Unknown" : "Unavailable"}. {capability.reason}
					</p>
				),
			)}
		</div>
	);
}
