import type { AgentState } from "@trellis/api";
import { Badge, type BadgeTone } from "@trellis/ui";

export type AgentStateBadgeProps = {
	// `off` is a manager with no session that holds a terminal.
	state: AgentState | "off";
};

const looks: Record<AgentStateBadgeProps["state"], { label: string; tone: BadgeTone }> = {
	starting: { label: "Starting", tone: "wait" },
	running: { label: "Running", tone: "ok" },
	waiting: { label: "Waiting", tone: "accent" },
	exited: { label: "Exited", tone: "bad" },
	stopped: { label: "Stopped", tone: "neutral" },
	failed: { label: "Failed", tone: "bad" },
	off: { label: "Off", tone: "neutral" },
};

// The state of one agent session as a word. The tone repeats the word, so
// color is never the only signal.
export function AgentStateBadge({ state }: AgentStateBadgeProps) {
	const look = looks[state];
	return <Badge tone={look.tone}>{look.label}</Badge>;
}
