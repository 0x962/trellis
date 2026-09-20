import { FlowRunSummary } from "../../../../domain/FlowRunSummary";
import { type FlowRunRow, FlowRunTree } from "../../../../domain/FlowRunTree";
import { Avatar } from "../../../../primitives/Avatar";
import { Section } from "../../Section";

// A review run that ran out of the budget of its first box: the failed step
// carries the error, the box shows the limit, and the later steps never ran.
const flowRunStart = Date.UTC(2026, 8, 18, 1, 54, 5);
const flowRow = (
	key: string,
	parentKey: string | null,
	depth: number,
	kind: FlowRunRow["kind"],
	title: string,
	state: FlowRunRow["state"],
	fields: Partial<FlowRunRow> = {},
): FlowRunRow => ({
	key,
	parentKey,
	depth,
	kind,
	title,
	state,
	meta: null,
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	output: null,
	error: null,
	terminal: false,
	decidable: false,
	hasChildren: false,
	...fields,
});
const flowRows: FlowRunRow[] = [
	flowRow("review", null, 0, "group", "Review", "canceled", {
		meta: "2 in order",
		hasChildren: true,
		startedAt: flowRunStart,
		endedAt: flowRunStart + 118_000,
	}),
	flowRow("budget", "review", 1, "group", "Group", "failed", {
		meta: "1 in order · 2 min limit",
		hasChildren: true,
		startedAt: flowRunStart,
		endedAt: flowRunStart + 118_000,
		deadlineAt: flowRunStart + 120_000,
	}),
	flowRow("summary", "budget", 2, "agent", "Summarize the change", "failed", {
		error: "Group New budget reached its time limit (2 min)",
		terminal: true,
		startedAt: flowRunStart + 15_000,
		endedAt: flowRunStart + 118_000,
		actor: (
			<Avatar
				kind="agent"
				name="Codex agent"
				agentProfile={{ provider: "openai", model: "GPT-6 Astra", effort: "High" }}
			/>
		),
	}),
	flowRow("parallel", "review", 1, "group", "At the same time", "canceled", {
		meta: "2 at the same time",
		hasChildren: true,
	}),
	flowRow("frontend", "parallel", 2, "group", "Frontend review", "not_started", {
		meta: "2 in order",
		hasChildren: true,
	}),
	flowRow("frontendGate", "frontend", 3, "gate", "Frontend relevant?", "not_started"),
	flowRow("approve", "frontend", 3, "human", "Approve the plan", "waiting_human", {
		decidable: true,
		startedAt: flowRunStart + 60_000,
	}),
	flowRow("backend", "parallel", 2, "agent", "Claude /code-review", "succeeded", {
		output: "No findings.",
		terminal: true,
		startedAt: flowRunStart + 20_000,
		endedAt: flowRunStart + 95_000,
		actor: (
			<Avatar
				kind="agent"
				name="Claude agent"
				agentProfile={{ provider: "anthropic", model: "Claude Opus 5", effort: "Max" }}
			/>
		),
	}),
];

export function FlowRunSection() {
	return (
		<Section
			name="FlowRunSummary and FlowRunTree"
			note="a run header and its steps as a tree"
			className="items-stretch"
		>
			<div className="flex w-full flex-col gap-3">
				<FlowRunSummary
					name="Review"
					version={34}
					status="failed"
					startedAt={flowRunStart}
					startedLabel="2h ago"
					durationMs={118_000}
					notice="Failed at Summarize the change"
					expanded
					onToggle={() => {}}
				/>
				<FlowRunTree
					label="Review steps"
					rows={flowRows}
					now={flowRunStart + 130_000}
					onDecide={() => {}}
					onOpenTerminal={() => {}}
				/>
			</div>
		</Section>
	);
}
