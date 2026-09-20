import { RunLine, type RunLineFacts, type RunLineKind } from "../../../../domain/RunLine";
import { Section } from "../../Section";

const profile = { provider: "anthropic", model: "Claude Opus 5", effort: "High" } as const;

const factsOf = (kind: RunLineKind, words: string, time: string | null, lastMessage: string | null): RunLineFacts => ({
	name: "crisp-fjord",
	harness: "Claude",
	profile,
	kind,
	words,
	time,
	lastMessage,
	metrics: "12m burned · 48,120 tokens",
});

const said = "crisp-fjord: I rebased onto master.";

// The twelve states of `runLine`, a run that says nothing, and a ticket that
// no agent holds.
const lines: readonly RunLineFacts[] = [
	factsOf("starts", "starts", null, null),
	factsOf("works", "works, tool Bash", "3m ago", said),
	factsOf("works", "works", "12s ago", null),
	factsOf("question", "asks: Which cap holds the sweep?", "1m ago", said),
	factsOf("permission", "asks to run: Bash", "2m ago", said),
	factsOf("elicitation", "asks: Project name", "4m ago", said),
	factsOf("idle", "idle", "18m ago", said),
	factsOf("turn-done", "turn done", "6m ago", said),
	factsOf("turn-done-new", "turn done · new", "1m ago", said),
	factsOf("failed", "failed: the branch is gone", null, said),
	factsOf("stopped", "stopped", null, said),
	factsOf("exited", "exited", null, said),
	factsOf("lost", "lost", null, said),
];

export function RunLineSection() {
	return (
		<Section name="RunLine" note="the twelve states, a run that says nothing, and no run" className="flex-col">
			{lines.map((line) => (
				<div key={`${line.kind}-${line.words}`} className="w-160 max-w-full">
					<RunLine run={line} onOpenSession={() => {}} />
				</div>
			))}
			<div className="w-160 max-w-full">
				<RunLine run={null} onOpenSession={() => {}} />
			</div>
		</Section>
	);
}
