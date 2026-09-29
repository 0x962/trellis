import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { rows, textArray } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";

export type StatusRequestRun = {
	id: string;
	kind: "agent" | "session";
	projectId: string | null;
	ticketId: string | null;
	terminalId: string;
};

export const statusRequestRuns = (tx: Tx, ids: string[]) =>
	rows<StatusRequestRun>(
		tx,
		sql`SELECT id, kind, project_id AS "projectId", ticket_id AS "ticketId", terminal_id AS "terminalId"
			FROM agent_runs
			WHERE id = ANY(${textArray(ids)})
				AND closed_at IS NULL
				AND runtime = 'native'
				AND terminal_id IS NOT NULL
				AND kind IN ('agent', 'session')
			ORDER BY id`,
	);

export const statusRequestProcesses = async (ctx: IoCtx, terminalIds: string[]): Promise<RuntimeProcessStatus[]> => {
	const answer = await nativeHost(ctx.home).list({ ids: terminalIds });
	if (!answer.complete) throw new Error("The execution service answered part of the status request list.");
	return answer.sessions;
};

export const requestStatusAtTurnBoundary = (
	ctx: IoCtx,
	input: { terminalId: string; requestId: string; text: string },
) => nativeHost(ctx.home).sendAtTurnBoundary(input.terminalId, input.text, input.requestId);
