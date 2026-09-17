import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getRun } from "../agentRuns/queries.ts";

type Target = {
	projectId: string;
	ticketId: string | null;
	newSession: boolean;
	accountId?: string | null;
	resumeRunId?: string;
	previousAttemptId?: string;
	sessionFingerprint?: string;
};
type Request = { requestId: string | undefined; target: Target };

export const replayRequest = async (ctx: ServiceCtx, tx: Tx, input: Request) => {
	if (input.requestId === undefined) return undefined;
	const actor = requireActor(ctx);
	const [request] = await rows<{ run_id: string; target: Target }>(
		tx,
		sql`SELECT run_id, target FROM agent_start_requests WHERE actor_kind = ${actor.kind} AND actor_name = ${actor.name} AND request_id = ${input.requestId}`,
	);
	if (!request) return undefined;
	if (
		request.target.projectId !== input.target.projectId ||
		request.target.ticketId !== input.target.ticketId ||
		request.target.newSession !== input.target.newSession ||
		(request.target.accountId ?? null) !== (input.target.accountId ?? null) ||
		request.target.resumeRunId !== input.target.resumeRunId ||
		request.target.previousAttemptId !== input.target.previousAttemptId ||
		request.target.sessionFingerprint !== input.target.sessionFingerprint
	)
		throw invalidInput("requestId", "This request ID already belongs to a different assignment.");
	return getRun(tx, request.run_id);
};

export const recordRequest = async (ctx: ServiceCtx, tx: Tx, input: Request & { runId: string }) => {
	if (input.requestId === undefined) return;
	const actor = requireActor(ctx);
	await tx.execute(sql`INSERT INTO agent_start_requests (request_id, actor_kind, actor_name, run_id, target, created_at)
		VALUES (${input.requestId}, ${actor.kind}, ${actor.name}, ${input.runId}, ${JSON.stringify(input.target)}::jsonb, ${ctx.now})`);
};
