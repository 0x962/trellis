import { ArrowsClockwise, FlowArrow, Stop } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type FlowAttemptV1,
	type FlowExecutionCancelInput,
	type FlowExecutionDecisionInput,
	type FlowExecutionRecord,
	type FlowExecutionViewV1,
	flowRunIsLive,
} from "@trellis/api";
import { Avatar, FlowRunSummary, FlowRunTree, IconButton, Tooltip } from "@trellis/ui";
import { type ComponentProps, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { relativeTime } from "../../../../../lib/format";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { allAgentRunsOptions } from "../../../../agents/allAgentRuns";
import { isAgentWorking } from "../../../../agents/isAgentWorking";
import { StartFlowDialog } from "../StartFlowDialog";
import { useClock } from "../../useClock";
import { buildFlowRunRows } from "./buildFlowRunRows";
import { buildExecutionViewRows } from "./buildFlowRunRows/buildExecutionViewRows";
import { lastFocusedRun, runTreeStates } from "./buildFlowRunRows/runViewState";
import { FlowCancelDialog } from "./components/FlowCancelDialog";
import { FlowDecisionDialog } from "./components/FlowDecisionDialog";
import { FlowTaskTerminal } from "./components/FlowTaskTerminal";
import { flowRunNotice } from "./flowRunNotice";
import { executionViewNotice } from "./flowRunNotice/executionViewNotice";

type Execution = FlowExecutionRecord | FlowExecutionViewV1;
type TerminalTarget = { task: FlowExecutionRecord["tasks"][number]; attempt?: FlowAttemptV1 };

const endOf = (execution: Execution) =>
	"snapshot" in execution
		? execution.occurrences.reduce(
				(end, item) => Math.max(end, item.endedAt === null ? 0 : Date.parse(item.endedAt)),
				Date.parse(execution.updatedAt),
			)
		: execution.state.steps.reduce((end, step) => Math.max(end, step.endedAt ?? 0), execution.state.updatedAt);

export function FlowRun({
	execution,
	ticket,
	diffId,
	expanded,
	onToggle,
	canStart,
	headSha,
	readOnly = false,
	recoveryBlocked = false,
	onDecideV1,
	onCancelV1,
	readRetainedOutput,
}: {
	execution: Execution;
	ticket: string;
	diffId: string;
	expanded: boolean;
	onToggle: () => void;
	canStart: boolean;
	headSha: string;
	readOnly?: boolean;
	recoveryBlocked?: boolean;
	onDecideV1?: (input: FlowExecutionDecisionInput) => Promise<FlowExecutionViewV1>;
	onCancelV1?: (input: FlowExecutionCancelInput) => Promise<FlowExecutionViewV1>;
	readRetainedOutput?: ComponentProps<typeof FlowTaskTerminal>["readRetainedOutput"];
}) {
	const { client, orpc } = useApp();
	const versioned = "snapshot" in execution;
	const flow = versioned ? execution.snapshot.flow : execution.doc.flow;
	const status = versioned ? execution.status : execution.state.status;
	const startedAt = versioned ? Date.parse(execution.createdAt) : execution.state.startedAt;
	const reviewedHead = versioned ? execution.reviewedHead : execution.headSha;
	const live = flowRunIsLive(status);
	const fenced =
		recoveryBlocked ||
		(versioned &&
			execution.submission !== null &&
			(execution.submission.ownership === "unknown" || execution.submission.admission === "closed"));
	const immutableOnly = readOnly || (versioned && onDecideV1 === undefined && onCancelV1 === undefined);
	const now = useClock(live);
	const runs = useQuery(allAgentRunsOptions(orpc, client, { ticket }));
	const rows = useMemo(
		() =>
			versioned
				? buildExecutionViewRows(execution, !immutableOnly && !fenced && onDecideV1 !== undefined)
				: buildFlowRunRows(execution).map((row) => ({ ...row, decidable: row.decidable && !immutableOnly && !fenced })),
		[execution, versioned, immutableOnly, fenced, onDecideV1],
	);
	const [decision, setDecision] = useState<string | null>(null);
	const [terminal, setTerminal] = useState<TerminalTarget | null>(null);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [confirmRepeat, setConfirmRepeat] = useState(false);
	const [opened, setOpened] = useState(expanded);
	if (expanded && !opened) setOpened(true);
	const [treeState, setTreeState] = useState(() => runTreeStates.get(execution.id));
	const targets = useMemo(() => {
		const result = new Map<string, TerminalTarget>();
		if (versioned) {
			for (const row of rows) {
				if (!("attempt" in row) || row.attempt === null) continue;
				const attempt = row.attempt;
				result.set(row.key, {
					attempt,
					task: {
						key: row.actionKey!,
						runId: attempt.agentRunId,
						attemptId: attempt.attemptId,
						resultId: attempt.resultId,
					},
				});
			}
		} else {
			const tasks = new Map(execution.tasks.map((task) => [task.key, task]));
			for (const row of rows) {
				const task = row.actionKey === null ? undefined : tasks.get(row.actionKey);
				if (task) result.set(row.key, { task });
			}
		}
		return result;
	}, [execution, versioned, rows]);
	const withActors = useMemo(() => {
		const byId = new Map(runs.data?.map((run) => [run.id, run]));
		return rows.map((row) => {
			const target = targets.get(row.key);
			const run = target ? byId.get(target.task.runId) : undefined;
			if (!run || run.terminalId !== target?.task.attemptId) return row;
			return {
				...row,
				actor: (
					<Avatar
						kind="agent"
						name={run.name}
						agentKind={agentKindOf(run.kind)}
						agentProfile={agentProfileOf(run.harness)}
						state={isAgentWorking(run) ? "working" : "static"}
					/>
				),
			};
		});
	}, [rows, runs.data, targets]);
	return (
		<section
			aria-label={`${flow.name} run`}
			className="flex min-w-0 flex-col gap-3"
			id={`flow-run-${execution.id}`}
			onFocusCapture={() => {
				lastFocusedRun.id = execution.id;
			}}
		>
			<FlowRunSummary
				name={flow.name}
				version={versioned ? execution.snapshot.revision : execution.state.flowVersion}
				status={status}
				startedAt={startedAt}
				startedLabel={relativeTime(new Date(startedAt).toISOString())}
				durationMs={(live ? now : endOf(execution)) - startedAt}
				notice={
					versioned ? executionViewNotice(execution, headSha, immutableOnly) : flowRunNotice(execution, rows, headSha)
				}
				expanded={expanded}
				onToggle={onToggle}
				actions={
					<>
						{live && !immutableOnly && (!versioned || onCancelV1 !== undefined) && (
							<Tooltip content="Cancel this run">
								<IconButton
									label="Cancel this run"
									icon={<Stop />}
									onClick={() => setConfirmCancel(true)}
									disabled={fenced}
								/>
							</Tooltip>
						)}
						{!live && canStart && !immutableOnly && !versioned && (
							<Tooltip content={`Run ${flow.name} again`}>
								<IconButton
									label={`Run ${flow.name} again`}
									icon={<ArrowsClockwise />}
									disabled={fenced}
									onClick={() => setConfirmRepeat(true)}
								/>
							</Tooltip>
						)}
						{!readOnly && (
							<Tooltip content={`Open ${flow.name} in the editor`}>
								<IconButton
									label={`Open ${flow.name} in the editor`}
									icon={<FlowArrow />}
									render={<Link to="/ai/flows/$slug" params={{ slug: flow.slug }} />}
								/>
							</Tooltip>
						)}
					</>
				}
			/>
			{opened && (
				<div hidden={!expanded}>
					<FlowRunTree
						label={`${flow.name} steps`}
						rows={withActors}
						now={now}
						state={treeState}
						restoreFocus={expanded && lastFocusedRun.id === execution.id}
						onStateChange={(next) => {
							runTreeStates.set(execution.id, next);
							setTreeState(next);
						}}
						onDecide={(key) => setDecision(rows.find((row) => row.key === key)?.actionKey ?? null)}
						onOpenTerminal={(key) => setTerminal(targets.get(key) ?? null)}
					/>
				</div>
			)}
			{terminal && (
				<FlowTaskTerminal
					task={terminal.task}
					attempt={terminal.attempt}
					reviewedHead={reviewedHead}
					recoveryBlocked={fenced || immutableOnly}
					readRetainedOutput={readRetainedOutput}
					onClose={() => setTerminal(null)}
				/>
			)}
			{decision !== null && (
				<FlowDecisionDialog
					key={JSON.stringify([execution.id, decision])}
					execution={execution}
					actionKey={decision}
					onClose={() => setDecision(null)}
					recoveryBlocked={fenced || immutableOnly}
					onDecideV1={onDecideV1}
				/>
			)}
			{confirmCancel && (
				<FlowCancelDialog
					key={execution.id}
					execution={execution}
					onClose={() => setConfirmCancel(false)}
					recoveryBlocked={fenced || immutableOnly}
					onCancelV1={onCancelV1}
				/>
			)}
			{confirmRepeat && (
				<StartFlowDialog
					key={execution.id}
					repeatOf={execution.id}
					ticket={ticket}
					diffId={diffId}
					headSha={headSha}
					initialFlowId={execution.flowId}
					repeatReason="The user selected Run again."
					recoveryBlocked={fenced || immutableOnly}
					onClose={() => setConfirmRepeat(false)}
				/>
			)}
		</section>
	);
}
