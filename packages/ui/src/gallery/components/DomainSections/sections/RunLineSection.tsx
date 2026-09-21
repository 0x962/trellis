import { RunLine, type RunLineKind, type RunLineValue } from "../../../../domain/RunLine";
import { Section } from "../../Section";

const profile = { provider: "anthropic", model: "Claude Opus 5", effort: "High" } as const;

const lineOf = (fields: {
	kind: RunLineKind;
	words: string;
	time: string | null;
	lastMessage: string | null;
	rawError?: string | null;
}): RunLineValue => ({
	name: "crisp-fjord",
	harness: "Claude",
	profile,
	metricsWords: "12m burned · 48,120 tokens",
	rawError: null,
	...fields,
});

const lastMessage = "crisp-fjord: I rebased onto master.";

// The twelve states of `runLine`, a run that says nothing, and a ticket that
// no agent holds.
const lines: readonly RunLineValue[] = [
	lineOf({ kind: "starts", words: "starts", time: null, lastMessage: null }),
	lineOf({ kind: "works", words: "works, tool Bash", time: "3m ago", lastMessage }),
	lineOf({ kind: "works", words: "works", time: "12s ago", lastMessage: null }),
	lineOf({ kind: "question", words: "asks: Which cap holds the sweep?", time: "1m ago", lastMessage }),
	lineOf({ kind: "permission", words: "asks to run: Bash", time: "2m ago", lastMessage }),
	lineOf({ kind: "elicitation", words: "asks: Project name", time: "4m ago", lastMessage }),
	lineOf({ kind: "idle", words: "idle", time: "18m ago", lastMessage }),
	lineOf({ kind: "turn-done", words: "turn done", time: "6m ago", lastMessage }),
	lineOf({ kind: "turn-done-new", words: "turn done · new", time: "1m ago", lastMessage }),
	lineOf({
		kind: "failed",
		words: "did not run: Trellis could not reach the execution service",
		time: null,
		lastMessage,
		rawError: "connect ENOENT /var/folders/example/runtime/runtime.sock",
	}),
	lineOf({ kind: "stopped", words: "stopped", time: null, lastMessage }),
	lineOf({ kind: "exited", words: "exited", time: null, lastMessage }),
	lineOf({ kind: "lost", words: "did not run: Trellis cannot find a live execution record", time: null, lastMessage }),
];

export function RunLineSection() {
	return (
		<Section name="RunLine" note="the twelve states, a run that says nothing, and no run">
			{lines.map((line) => (
				<div key={`${line.kind}-${line.words}`} className="w-full max-w-160">
					<RunLine
						run={line}
						retry={line.kind === "failed" ? { starting: false, error: null, onRetry: () => {} } : null}
						onOpenSession={() => {}}
					/>
				</div>
			))}
			<div className="w-full max-w-160">
				<RunLine run={null} onOpenSession={() => {}} />
			</div>
		</Section>
	);
}
