import type { FlowEdge, FlowExecutionRecord, FlowNode } from "@trellis/api";
import type { FlowRunRow, FlowRunState } from "@trellis/ui";

type Doc = FlowExecutionRecord["doc"];
type Step = FlowExecutionRecord["state"]["steps"][number];

export type FlowRunRowData = FlowRunRow & {
	// The key of the agent attempt or the human decision the row stands for.
	actionKey: string | null;
};

// The editor gives a new box this title and hides it on the canvas.
const untitledBox = "New budget";
const byPosition = (a: FlowNode, b: FlowNode) => a.y - b.y || a.x - b.x;
const branchRank = { yes: 0, out: 1, no: 2 } as const;
const decisionWord = (decision: "yes" | "no") => (decision === "yes" ? "Yes" : "No");

// The children of `parentId` in the order they run: by position in a
// parallel box, and along the wires from the entry step elsewhere. A yes
// branch comes before a no branch, and a step that both branches reach comes
// after both. A child that no wire reaches comes last.
export function scopeOrder(doc: Doc, parentId: string | null): FlowNode[] {
	const scope = doc.nodes.filter((node) => node.parentId === parentId).sort(byPosition);
	const parent = parentId === null ? null : doc.nodes.find((node) => node.id === parentId)!;
	if (parent?.kind === "group" && parent.parallel) return scope;
	const byId = new Map(scope.map((node) => [node.id, node]));
	const outgoing = new Map<string, FlowEdge[]>();
	const waiting = new Map(scope.map((node) => [node.id, 0]));
	for (const edge of doc.edges) {
		if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) continue;
		outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge]);
		waiting.set(edge.toNodeId, waiting.get(edge.toNodeId)! + 1);
	}
	const queue = scope.filter((node) => waiting.get(node.id) === 0);
	const ordered: FlowNode[] = [];
	const placed = new Set<string>();
	while (queue.length > 0) {
		const node = queue.shift()!;
		placed.add(node.id);
		ordered.push(node);
		const edges = [...(outgoing.get(node.id) ?? [])].sort(
			(a, b) => branchRank[a.branch] - branchRank[b.branch] || byPosition(byId.get(a.toNodeId)!, byId.get(b.toNodeId)!),
		);
		for (const edge of edges) {
			const left = waiting.get(edge.toNodeId)! - 1;
			waiting.set(edge.toNodeId, left);
			if (left === 0) queue.push(byId.get(edge.toNodeId)!);
		}
	}
	return [...ordered, ...scope.filter((node) => !placed.has(node.id))];
}

// The state of one round of a loop, read from the steps of that round.
const roundState = (children: Step[]): FlowRunState => {
	if (children.length === 0) return "not_started";
	if (children.some((child) => child.state === "failed")) return "failed";
	if (children.some((child) => child.state === "canceled")) return "canceled";
	if (children.every((child) => child.state === "succeeded" || child.state === "skipped")) return "succeeded";
	if (children.some((child) => child.state === "waiting_human")) return "waiting_human";
	return "running";
};

const emptyRow = {
	meta: null,
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	output: null,
	error: null,
	terminal: false,
	decidable: false,
	hasChildren: false,
	actionKey: null,
} satisfies Partial<FlowRunRowData>;

// The rows of a run in display order. Every node of the saved graph gets a
// row, so the steps of a box that never started show as not started. A loop
// that ran more than one round gets a row per round, and each round ends with
// the row of its exit question.
export function buildFlowRunRows(execution: FlowExecutionRecord): FlowRunRowData[] {
	const { doc, state, tasks } = execution;
	const steps = new Map(state.steps.map((step) => [step.key, step]));
	const taskKeys = new Set(tasks.map((task) => task.key));
	const nodes = new Map(doc.nodes.map((node) => [node.id, node]));
	const rows: FlowRunRowData[] = [];
	const childNodes = (node: FlowNode) => doc.nodes.filter((child) => child.parentId === node.id);
	const childSteps = (key: string, round: number) =>
		state.steps.filter((child) => child.parentKey === key && child.iteration === round);

	// Why a skipped step did not run: the gate before it answered the other way.
	const skipReason = (node: FlowNode, step: Step) => {
		for (const edge of doc.edges) {
			if (edge.toNodeId !== node.id || edge.branch === "out") continue;
			const source = state.steps.find(
				(candidate) =>
					candidate.nodeId === edge.fromNodeId &&
					candidate.parentKey === step.parentKey &&
					candidate.iteration === step.iteration,
			);
			if (source?.decision != null && source.decision !== edge.branch)
				return `${nodes.get(source.nodeId)!.title} answered ${decisionWord(source.decision)}`;
		}
		return null;
	};

	const meta = (node: FlowNode, step: Step | null) => {
		if (step?.state === "skipped") return skipReason(node, step);
		if (node.kind === "group") {
			const count = childNodes(node).length;
			const mode = node.parallel ? `${count} at the same time` : `${count} in order`;
			return node.minutes === null ? mode : `${mode} · ${node.minutes} min limit`;
		}
		if (node.kind === "loop")
			return step === null ? `up to ${node.maxRounds} rounds` : `round ${step.round} of ${node.maxRounds}`;
		if (step === null) return null;
		if (node.kind === "gate") return step.decision === null ? null : decisionWord(step.decision);
		if (node.kind === "human") return step.state === "succeeded" ? "Approved" : null;
		return null;
	};

	// The exit question of a loop after one round. A past round answered No,
	// which is why a later round exists.
	const conditionRow = (step: Step, key: string, round: number, parentKey: string, depth: number) => {
		const actionKey = `${key}:condition:${round}`;
		const current = round === step.round;
		const asked = current && step.phase === "condition";
		rows.push({
			...emptyRow,
			key: actionKey,
			parentKey,
			depth,
			kind: "gate",
			title: "Exit question",
			state: current ? (asked ? step.state : "not_started") : "succeeded",
			meta: asked ? (step.decision === null ? null : decisionWord(step.decision)) : current ? null : "No",
			terminal: taskKeys.has(actionKey),
			actionKey,
		});
	};

	const visit = (
		parentId: string | null,
		parentStepKey: string | null,
		parentRowKey: string | null,
		iteration: number,
		depth: number,
	) => {
		for (const node of scopeOrder(doc, parentId)) {
			const key = `${parentStepKey ?? "root"}/${iteration}/${node.id}`;
			const step = steps.get(key) ?? null;
			const box = node.kind === "group" || node.kind === "loop";
			const hasChildren = box && childNodes(node).length > 0;
			// A box carries the error of its failed child. The child's row shows it.
			const inherited =
				step !== null && step.error !== null && childSteps(key, step.round).some((child) => child.error === step.error);
			rows.push({
				key,
				parentKey: parentRowKey,
				depth,
				kind: node.kind,
				title: node.kind === "group" && node.title === untitledBox ? "Group" : node.title,
				state: step === null ? "not_started" : step.state,
				meta: meta(node, step),
				startedAt: step?.startedAt ?? null,
				endedAt: step?.endedAt ?? null,
				deadlineAt: step?.deadlineAt ?? null,
				output: step === null || box || node.kind === "gate" || !step.output ? null : step.output,
				error: step === null || inherited ? null : step.error,
				terminal: step !== null && !box && taskKeys.has(step.actionKey),
				decidable: step?.state === "waiting_human",
				hasChildren,
				actionKey: step === null || box ? null : step.actionKey,
			});
			if (!hasChildren) continue;
			const rounds = step === null ? 1 : step.round;
			for (let round = 1; round <= rounds; round++) {
				const perRound = node.kind === "loop" && rounds > 1;
				const roundKey = perRound ? `${key}:round:${round}` : key;
				const childDepth = perRound ? depth + 2 : depth + 1;
				if (perRound)
					rows.push({
						...emptyRow,
						key: roundKey,
						parentKey: key,
						depth: depth + 1,
						kind: "loop",
						title: `Round ${round}`,
						state: roundState(childSteps(key, round)),
						hasChildren: true,
					});
				visit(node.id, key, roundKey, round, childDepth);
				if (node.kind === "loop" && step !== null) conditionRow(step, key, round, roundKey, childDepth);
			}
		}
	};
	visit(null, null, null, 1, 0);
	return rows;
}
