import { useQuery } from "@tanstack/react-query";
import type { GhReason } from "@trellis/api";
import { Badge, Button } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { ghConsequence, ghCopy } from "../../../lib/ghCopy";
import { CliLine } from "../../shell/CliLine";
import { SettingsRow } from "../SettingsRow";

// The state word for each reason gh cannot answer.
const badges: Record<GhReason, string> = {
	missing: "Not installed",
	unauthenticated: "Not signed in",
	error: "No answer",
};

// What `system.gh` reports. A working gh shows the signed-in user and the
// time of the last check. A gh that does not work shows its state, one line
// from ghCopy, the command to run, and the raw server message behind
// Details.
export function GhBanner() {
	const { orpc, queryClient } = useApp();
	const gh = useQuery(orpc.system.gh.queryOptions({})).data;
	if (gh === undefined) return null;

	const reason = gh.reason ?? "error";
	const copy = ghCopy[reason];
	const checkAgain = () => void queryClient.invalidateQueries({ queryKey: orpc.system.gh.key() });
	return (
		<SettingsRow label="GitHub" hint="PR state and checks come from the gh CLI.">
			{gh.ok ? (
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="ok">Signed in</Badge>
					<span className="text-sm text-fg-muted">gh is signed in as {gh.user}</span>
					{gh.checkedAt !== null && <span className="text-sm text-fg-faint">Checked {relativeTime(gh.checkedAt)}</span>}
				</div>
			) : (
				<div role="alert" className="flex flex-col items-start gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone="wait">{badges[reason]}</Badge>
						<p className="text-sm text-fg">
							{copy.line} {ghConsequence}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{copy.command !== null && <CliLine command={copy.command} />}
						<Button variant="quiet" onClick={checkAgain}>
							Check again
						</Button>
					</div>
					{gh.message !== null && (
						<details className="text-sm text-fg-muted">
							<summary className="text-fg-muted">Details</summary>
							<pre className="mt-1 font-mono text-xs break-all whitespace-pre-wrap">{gh.message}</pre>
						</details>
					)}
				</div>
			)}
		</SettingsRow>
	);
}
