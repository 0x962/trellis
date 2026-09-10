import { useQuery } from "@tanstack/react-query";
import { Badge, IconButton } from "@trellis/ui";
import { Copy } from "lucide-react";
import { useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { SettingsRow } from "../SettingsRow";

// What to say and what to run for each reason gh cannot answer. An error the
// server could not name carries its own message and no command.
const reasons: Record<string, { line: string; command: string | null }> = {
	missing: { line: "trellis cannot find the GitHub CLI.", command: "brew install gh" },
	unauthenticated: { line: "gh is not signed in.", command: "gh auth login" },
	error: { line: "gh did not answer.", command: null },
};

// What `system.gh` reports. A ready gh shows the signed-in user and the time
// of the last check; a gh that is missing or signed out shows what to run.
export function GhBanner() {
	const { orpc } = useApp();
	const gh = useQuery(orpc.system.gh.queryOptions({})).data;
	if (gh === undefined) return null;

	const reason = reasons[gh.reason ?? "error"]!;
	return (
		<SettingsRow label="GitHub" hint="Pull request state and checks come from the gh CLI.">
			{gh.ok ? (
				<div className="flex items-center gap-2">
					<Badge tone="ok">Ready</Badge>
					<span className="text-sm text-fg-muted">gh is ready as {gh.user}</span>
					{gh.checkedAt !== null && <span className="text-sm text-fg-muted">Checked {relativeTime(gh.checkedAt)}</span>}
				</div>
			) : (
				<div role="alert" className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
					<p className="text-sm text-fg">{reason.line}</p>
					<p className="text-sm text-fg-muted">Pull request checks stay empty until gh answers.</p>
					{gh.message !== null && <p className="text-sm text-fg-muted">{gh.message}</p>}
					{reason.command !== null && (
						<div className="flex items-center gap-2">
							<code className="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-xs text-fg-muted">
								{reason.command}
							</code>
							<IconButton
								label="Copy the command"
								icon={<Copy />}
								onClick={() => void navigator.clipboard.writeText(reason.command!)}
							/>
						</div>
					)}
				</div>
			)}
		</SettingsRow>
	);
}
