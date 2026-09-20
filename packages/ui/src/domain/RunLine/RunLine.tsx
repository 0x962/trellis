import { Terminal } from "@phosphor-icons/react";
import { ActivityDot } from "../../primitives/ActivityDot";
import { AttentionDot } from "../../primitives/AttentionDot";
import { type AgentProfile, Avatar } from "../../primitives/Avatar";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

// The state of one run, in twelve values. `runLine` in
// `packages/api/src/runLine/runLine.ts` computes the value and the words of
// each line. This package holds no dependency on that package, so the twelve
// values are written here again.
export type RunLineKind =
	| "starts"
	| "works"
	| "question"
	| "permission"
	| "elicitation"
	| "idle"
	| "turn-done"
	| "turn-done-new"
	| "failed"
	| "stopped"
	| "exited"
	| "lost";

export type RunLineValue = {
	// The name of the run, such as `crisp-fjord`.
	name: string;
	// The name of the command line program that runs the agent, such as `Claude`.
	harness: string;
	// The provider, the model and the effort. `Avatar` shows them as a round
	// mark at the left of the line. The mark widens on a hover and adds the
	// model name.
	profile: AgentProfile;
	kind: RunLineKind;
	// The state of the run in words, such as `works, tool Bash`.
	words: string;
	// How long the run holds this state, in words, such as `3m ago`. It is
	// null for a state that has no time.
	time: string | null;
	// What the run said last, such as `crisp-fjord: I rebased onto master.`
	// It is null while the run says nothing.
	lastMessage: string | null;
	// The time and the tokens the ticket burned, in words. A person reads it
	// on a hover of the line.
	metricsWords: string;
};

export type RunLineProps = {
	// The run of the ticket. It is null while no agent holds the ticket.
	run: RunLineValue | null;
	onOpenSession: () => void;
};

// These four states show an attention dot. The first three wait for an answer
// from a person. `turn-done-new` is a finished turn that nobody read.
const waitingKinds: readonly RunLineKind[] = ["question", "permission", "elicitation", "turn-done-new"];
// Both states show the same red dot. `failed` says the run stopped on an
// error. `lost` says the server holds no live record of the run. The words
// state the difference.
const brokenKinds: readonly RunLineKind[] = ["failed", "lost"];

function StateDot({ kind }: { kind: RunLineKind }) {
	if (waitingKinds.includes(kind)) return <AttentionDot label="The run waits for a person." />;
	if (brokenKinds.includes(kind))
		return <AttentionDot tone="danger" label={kind === "failed" ? "The run failed." : "The run is lost."} />;
	if (kind === "starts") return <ActivityDot placement="inline" label="The agent starts." />;
	if (kind === "works") return <ActivityDot placement="inline" label="The agent works." />;
	return null;
}

const wordsTone = (kind: RunLineKind) =>
	waitingKinds.includes(kind) ? "text-warning" : brokenKinds.includes(kind) ? "text-danger" : "text-fg-muted";

// The `Avatar` mark moves only in the `works` state.
export function RunLine({ run, onOpenSession }: RunLineProps) {
	if (run === null) {
		return (
			<section aria-label="The run" className="flex min-w-0 flex-col">
				<EmptyState description="No agent works on this ticket." />
			</section>
		);
	}
	return (
		<section aria-label="The run" className="flex min-w-0 flex-col gap-0.5">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<Tooltip content={run.metricsWords}>
					<div className="flex min-w-0 items-center gap-2">
						<Avatar
							kind="agent"
							name={run.name}
							agentProfile={run.profile}
							state={run.kind === "works" ? "working" : "static"}
						/>
						<span className="shrink-0 font-medium text-fg">{run.name}</span>
						<span className="shrink-0 text-fg-muted">{run.harness}</span>
						<span className="max-w-32 truncate text-fg-muted">{run.profile.model}</span>
						<StateDot kind={run.kind} />
						<span className={cx("truncate", wordsTone(run.kind))}>{run.words}</span>
						{run.time !== null && <span className="shrink-0 text-fg-faint tabular">{run.time}</span>}
					</div>
				</Tooltip>
				<Tooltip content="Session">
					<IconButton
						className="ml-auto"
						label="Session"
						icon={<Terminal aria-hidden="true" />}
						onClick={onOpenSession}
					/>
				</Tooltip>
			</div>
			{run.lastMessage !== null && (
				<p title={run.lastMessage} className="truncate pl-6.5 text-sm text-fg-muted">
					{run.lastMessage}
				</p>
			)}
		</section>
	);
}
