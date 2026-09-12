import { Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../../lib/appContext";
import { ghCopy } from "../../../../../lib/ghCopy";
import { CliLine } from "../../../../shell/CliLine";

// What `system.gh` reports, as one 32 px row in the words of the shared gh
// copy module, with the command that fixes it. A working gh shows nothing.
export function GhBanner() {
	const { orpc } = useApp();
	const gh = useQuery(orpc.system.gh.queryOptions({})).data;
	if (gh === undefined || gh.ok) return null;

	const copy = ghCopy[gh.reason ?? "error"];
	return (
		<div data-gh-banner="" role="alert" className="flex min-h-8 flex-wrap items-center gap-2">
			<Warning aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
			<span className="text-sm text-fg-muted">{copy.line}</span>
			{copy.command !== null && <CliLine command={copy.command} />}
		</div>
	);
}
