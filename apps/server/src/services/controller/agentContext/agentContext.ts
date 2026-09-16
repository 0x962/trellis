import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { managerScope } from "../../submanagers/scope.ts";
import type { ControllerCtx, ControllerInput } from "../types.ts";

type Assignment = {
	runId: string;
	name: string;
	kind: string;
	ticketId: string | null;
	ticketIdentifier: string | null;
	attemptId: string | null;
	error: string | null;
};

export const agentContext = async (
	ctx: ControllerCtx,
	tx: Tx,
	input: ControllerInput & { projectId: string; runId: string },
) => {
	const sessions = new Map(input.sessions.map((session) => [session.id, session]));
	const liveIds = input.sessions.filter((session) => session.status === "running").map((session) => session.id);
	const assignments = await rows<Assignment>(
		tx,
		sql` SELECT r.id AS "runId", r.persona_name AS name, r.kind, r.ticket_id AS "ticketId",
			r.ticket_identifier AS "ticketIdentifier", r.terminal_id AS "attemptId", r.error
		FROM agent_runs r WHERE (r.project_id IN (${managerScope(input.projectId)}) OR r.id IN (SELECT run_id FROM manager_delegations WHERE parent_run_id=${input.runId} AND retired_at IS NULL))
		AND r.id<>${input.runId} AND r.runtime='native'
		AND (r.id IN (SELECT run_id FROM manager_delegations WHERE parent_run_id=${input.runId} AND retired_at IS NULL) OR r.closed_at IS NULL OR r.terminal_id IN (
			SELECT jsonb_array_elements_text(${JSON.stringify(liveIds)}::jsonb)
		)) ORDER BY r.created_at,r.id`,
	);
	return {
		observedAt: ctx.now.toISOString(),
		agents: assignments.map(({ error, ...assignment }) => {
			const session = assignment.attemptId === null ? undefined : sessions.get(assignment.attemptId);
			const isWorking =
				session?.status === "exited"
					? false
					: session?.status === "running" && session.controllable && session.activity !== null
						? session.activity.state === "working" && session.agent?.outcome == null
						: null;
			const tool = session?.agent?.tool;
			const lastTool = session?.agent?.lastTool;
			const lastMessage = session?.agent?.lastMessage;
			const excerpt = (value: unknown) =>
				value === undefined ? null : (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 2000);
			return {
				...assignment,
				processStatus: session?.status ?? "missing",
				pid: session?.pid ?? null,
				controllable: session?.controllable ?? false,
				checkedAt: session?.checkedAt ?? null,
				activity: session?.activity?.state ?? "unknown",
				lastActivityAt: session?.activity?.updatedAt ?? null,
				isWorking,
				turnId: session?.agent?.turnId ?? null,
				tool: isWorking && tool ? { id: tool.id, name: tool.name } : null,
				lastTool: lastTool ? { ...lastTool, input: excerpt(lastTool.input), output: excerpt(lastTool.output) } : null,
				lastMessage: lastMessage ? { ...lastMessage, text: lastMessage.text.slice(0, 2000) } : null,
				lastResult: session?.result?.text.slice(0, 2000) ?? null,
				exitCode: session?.exitCode ?? null,
				error: session?.agent?.error ?? session?.error ?? error,
			};
		}),
	};
};
