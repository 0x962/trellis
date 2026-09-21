import { type AgentRun, runLine, type TicketMetrics } from "@trellis/api";
import { RunLine as RunLineView } from "@trellis/ui";
import { relativeTime } from "../../../lib/format";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { harnessLabel } from "../../sessions/harnessLabel";
import { metricsWords } from "./metricsWords";

export type RunLineProps = {
	// The run that holds the ticket. It is null while no agent holds it.
	run: AgentRun | null;
	// The time and the tokens the ticket burned. It is null while the server
	// counts them.
	metrics: TicketMetrics | null;
	retry?: { starting: boolean; error: string | null; onRetry: () => void } | null;
	onOpenSession: () => void;
};

// `runLine` reads the state of the run and writes the words of the line.
export function RunLine({ run, metrics, retry = null, onOpenSession }: RunLineProps) {
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
				rawError: line.rawError,
				metricsWords: metricsWords(metrics),
			}}
			retry={retry}
			onOpenSession={onOpenSession}
		/>
	);
}
