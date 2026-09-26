import { AgentBroadcastInputSchema, type AgentBroadcastRecipient, type AgentBroadcastResult } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";
import { prepareSend } from "../communication.ts";
import { readRuntimeSessionsRequired } from "../liveState.ts";
import { listColumns, type StoredRun, storedRows } from "../queries.ts";

type Group = "working" | "idle";

type Target = {
	group: Group;
	run: StoredRun;
	recipient: AgentBroadcastRecipient;
};

type BroadcastDeps = {
	read: typeof readRuntimeSessionsRequired;
	send: (
		ctx: IoCtx,
		input: {
			id: string;
			text: string;
			messageId: string;
			expectedTerminalId: string | null;
			expectedSessionId: string | null;
		},
	) => Promise<unknown>;
};

const depsOf = (ctx: IoCtx): BroadcastDeps => ({
	read: readRuntimeSessionsRequired,
	send: prepareSend,
});

export const broadcastRows = (tx: Tx) =>
	storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs
			WHERE runtime = 'native' AND terminal_id IS NOT NULL AND closed_at IS NULL
			AND (
				project_id IS NULL OR EXISTS (
					SELECT 1 FROM projects WHERE projects.id = agent_runs.project_id AND projects.archived_at IS NULL
				)
			)
			AND (
				kind <> 'session' OR EXISTS (
					SELECT 1 FROM sessions WHERE sessions.run_id = agent_runs.id AND sessions.archived_at IS NULL
				)
			)
			ORDER BY id`,
	);

const groupOf = (process: RuntimeProcessStatus): Group | null => {
	if (process.agent?.error || process.agent?.outcome === "failed") return null;
	if (
		process.status === "running" &&
		process.controllable &&
		process.activity?.state === "working" &&
		process.agent?.outcome === null
	)
		return "working";
	if (process.status === "exited" && process.stopReason === "idle") return "idle";
	if (process.status === "running" && process.controllable) return "idle";
	return null;
};

const recipientOf = (run: StoredRun): AgentBroadcastRecipient => ({
	id: run.id,
	name: run.name,
	kind: run.kind,
	projectKey: run.projectKey,
	ticketIdentifier: run.ticketIdentifier,
});

export const selectBroadcastTargets = (runs: StoredRun[], processes: RuntimeProcessStatus[]): Target[] => {
	const byTerminal = new Map(processes.map((process) => [process.id, process]));
	return runs.flatMap((run) => {
		const process = byTerminal.get(run.terminalId!);
		const group = process === undefined ? null : groupOf(process);
		return group === null ? [] : [{ group, run, recipient: recipientOf(run) }];
	});
};

const targets = async (ctx: IoCtx, read: BroadcastDeps["read"]) => {
	const runs = await ctx.newTx(broadcastRows);
	if (runs.length === 0) return [];
	const terminalIds = [...new Set(runs.map((run) => run.terminalId!))];
	return selectBroadcastTargets(runs, await read(ctx.home, { ids: terminalIds }));
};

export async function prepareBroadcastRecipients(
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: BroadcastDeps = depsOf(ctx),
) {
	const selected = await targets(ctx, deps.read);
	return {
		working: selected.filter((target) => target.group === "working").length,
		idle: selected.filter((target) => target.group === "idle").length,
	};
}

export const broadcastRecipients = (_ctx: IoCtx, _tx: Tx, input: unknown) => Promise.resolve(input);

export async function prepareBroadcast(
	ctx: IoCtx,
	value: unknown,
	deps: BroadcastDeps = depsOf(ctx),
): Promise<AgentBroadcastResult> {
	const input = AgentBroadcastInputSchema.parse(value);
	const selected = (await targets(ctx, deps.read)).filter((target) => target.group === input.group);
	const deliveries = await Promise.allSettled(
		selected.map((target) =>
			deps.send(ctx, {
				id: target.run.id,
				text: input.text,
				messageId: `${input.requestId}-${target.run.id}`,
				expectedTerminalId: target.run.terminalId,
				expectedSessionId: target.run.sessionId,
			}),
		),
	);
	const failures = deliveries.flatMap((delivery, index) =>
		delivery.status === "rejected"
			? [
					{
						recipient: selected[index]!.recipient,
						reason: delivery.reason instanceof Error ? delivery.reason.message : String(delivery.reason),
					},
				]
			: [],
	);
	return {
		group: input.group,
		recipientCount: selected.length,
		acceptedCount: selected.length - failures.length,
		failures,
	};
}

export const broadcast = (_ctx: IoCtx, _tx: Tx, input: AgentBroadcastResult) => Promise.resolve(input);
