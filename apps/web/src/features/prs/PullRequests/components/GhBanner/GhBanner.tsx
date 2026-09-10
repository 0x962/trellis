import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../../lib/appContext";
import { ghConsequence, ghCopy } from "../../../../../lib/ghCopy";

// What `system.gh` reports, in the words of the shared gh copy module. A
// working gh shows nothing.
export function GhBanner() {
	const { orpc } = useApp();
	const gh = useQuery(orpc.system.gh.queryOptions({})).data;
	if (gh === undefined || gh.ok) return null;

	const copy = ghCopy[gh.reason ?? "error"];
	return (
		<div
			data-gh-banner=""
			role="alert"
			className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2"
		>
			<p className="text-sm text-fg">{copy.line}</p>
			<p className="text-sm text-fg-muted">{ghConsequence}</p>
			{copy.command !== null && (
				<code className="self-start rounded-sm border border-border bg-bg px-2 py-1 font-mono text-xs text-fg-muted">
					{copy.command}
				</code>
			)}
		</div>
	);
}
