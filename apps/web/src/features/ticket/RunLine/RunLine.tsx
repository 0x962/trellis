import { type AgentRun, runLine, type TicketMetrics } from "@trellis/api";
import { RunLine as RunLineView } from "@trellis/ui";
import { formatCount, formatDuration, relativeTime } from "../../../lib/format";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { harnessLabel } from "../../sessions/harnessLabel";

export type RunLineProps = {
	// The run that holds the ticket. It is null while no agent holds it.
	run: AgentRun | null;
	// The time and the tokens the ticket burned. It is null while the server
	// counts them.
	metrics: TicketMetrics | null;
	onOpenSession: () => void;
};

// The words of the hover: the time and the tokens that the ticket burned.
// `TicketMetrics` in the properties rail prints the same two numbers.
const metricsWords = (metrics: TicketMetrics | null) => {
	if (metrics === null) return "The time and the tokens are not counted.";
	const time = metrics.durationMs === null ? "no time" : formatDuration(metrics.durationMs);
	const tokens = metrics.tokenCount === null ? "no tokens" : `${formatCount(metrics.tokenCount)} tokens`;
	return `${time} burned · ${tokens}`;
};

// The run of a ticket on one line. `runLine` reads the state of the run and
// writes the words. This component adds the harness name, the agent card and
// the two hover numbers.
export function RunLine({ run, metrics, onOpenSession }: RunLineProps) {
	if (run === null) return <RunLineView run={null} onOpenSession={onOpenSession} />;
	const line = runLine(run);
	return (
		<RunLineView
			run={{
				name: run.name,
				harness: run.harness === null ? "Harness not recorded" : harnessLabel(run.harness.preset),
				profile: agentProfileOf(run.harness),
				kind: line.kind,
				words: line.words,
				time: line.since === null ? null : relativeTime(line.since),
				lastMessage: line.lastMessage?.words ?? null,
				metrics: metricsWords(metrics),
			}}
			onOpenSession={onOpenSession}
		/>
	);
}
