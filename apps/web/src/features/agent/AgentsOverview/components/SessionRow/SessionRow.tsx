import type { AgentSession } from "@trellis/api";
import { relativeTime } from "../../../../../lib/format";
import { AgentStateBadge } from "../../../AgentStateBadge";
import { OpenInSuperset } from "../../../OpenInSuperset";

export type SessionRowProps = {
	session: AgentSession;
};

const roleLabels = { manager: "Manager", builder: "Builder", reviewer: "Reviewer" } as const;

// One agent session, with the runner's own error under it. The name leads
// the row: a person calls the agent by it. The row carries the session id
// as its anchor, so a link from a failed agent lands on it.
export function SessionRow({ session }: SessionRowProps) {
	return (
		<li id={session.id} className="flex flex-col gap-1 border-border border-b px-3 py-2 last:border-b-0">
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				<span className="font-medium text-fg">{session.name}</span>
				<span className="text-fg-muted">{session.title}</span>
				<span className="text-fg-muted">{roleLabels[session.role]}</span>
				<AgentStateBadge state={session.state} />
				<span className="font-mono text-fg-faint text-xs">{session.workspaceId ?? "no workspace"}</span>
				<span className="ml-auto text-fg-faint tabular">
					{session.lastWokenAt === null ? "No batch yet" : `Last batch ${relativeTime(session.lastWokenAt)}`}
				</span>
				{session.openUrl !== null && <OpenInSuperset url={session.openUrl} />}
			</div>
			{session.error !== null && <p className="text-danger text-sm">{session.error}</p>}
		</li>
	);
}
