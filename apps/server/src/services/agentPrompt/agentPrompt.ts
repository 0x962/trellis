import { agentGuide, contextKeys } from "@trellis/api/agent-guide";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import type { LaunchRun } from "../agentRuns/queries.ts";
import { get as settings } from "../settings/index.ts";
import { projectContext } from "./projectContext.ts";
import { cell } from "./text.ts";
import { ticketContext } from "./ticketContext.ts";

export async function agentPrompt(
	ctx: ServiceCtx,
	tx: Tx,
	input: {
		run: LaunchRun;
		workspace: string;
		branch: string;
		attemptId: string;
		host: string;
		request: string;
	},
) {
	const { run } = input;
	const context: Record<string, string> = Object.fromEntries(contextKeys.map((key) => [key, "None"]));
	const [origin] = await rows<{ kind: string; name: string }>(
		tx,
		sql`SELECT actor_kind AS kind,actor_name AS name FROM agent_start_requests WHERE run_id=${run.id} ORDER BY created_at,request_id LIMIT 1`,
	);
	const [session] = await rows<{ id: string }>(tx, sql`SELECT id FROM sessions WHERE run_id=${run.id}`);
	const user = origin?.kind === "human" ? origin.name : (await settings(ctx, tx)).defaultActorName;
	Object.assign(context, {
		"user.name": cell(user),
		"user.identity": cell(`human:${user}`),
		"user.timezone": "Not recorded",
		"user.context": "Not recorded",
		"context.generated_at": ctx.now.toISOString(),
		"session.task_type": run.kind,
		"session.id": session?.id ?? "None",
		"session.agent_id": run.id,
		"session.attempt_id": input.attemptId,
		"session.assignment_origin": origin ? cell(`${origin.kind}:${origin.name}`) : "Not recorded",
		"session.execution_host": cell(input.host),
		"session.workspace": cell(input.workspace),
		"session.branch": cell(input.branch),
		"session.request": input.request,
	});
	const ticket = run.ticketId === null ? null : await ticketGet(tx, run.ticketId);
	if (run.projectId !== null)
		Object.assign(
			context,
			await projectContext(ctx, tx, { projectId: run.projectId, epicId: ticket?.epic?.id ?? null }),
		);
	if (ticket !== null) Object.assign(context, await ticketContext(ctx, tx, ticket));
	return agentGuide(context);
}
