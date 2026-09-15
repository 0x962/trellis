import type { ExternalRetirement, ExternalRetirementInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail, invalidInput } from "../../../errors.ts";
import { record } from "../../activity.ts";
import { announce } from "../../agentSessions.ts";
import { hostOf, readAgentSettings } from "../../agentSettings.ts";
import { managerConfigOf, projectRow } from "../../projectRows.ts";
import { retirementOf } from "./retirementOf.ts";

type Assignment = {
	projectId: string;
	ticketId: string | null;
	runtime: string;
	workspaceId: string | null;
	terminalId: string | null;
	sessionId: string | null;
	state: string;
	kind: string;
};
export const retireExternal = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: ExternalRetirementInput,
): Promise<ExternalRetirement> => {
	const actor = requireActor(ctx);
	if (actor.kind !== "human")
		throw invalidInput("actor", "A person must confirm that the external process has stopped.");
	if (input.externalProcessStopped !== true)
		throw invalidInput(
			"externalProcessStopped",
			"Confirm that the external process has stopped before you retire its assignment.",
		);
	const table = sql.identifier(input.source === "legacy" ? "agent_sessions" : "agent_runs");
	const runtime = sql.identifier(input.source === "legacy" ? "runner" : "runtime");
	const kind = sql.identifier(input.source === "legacy" ? "role" : "kind");
	const session = sql.identifier(input.source === "legacy" ? "claude_session_id" : "session_id");
	const [run] = await rows<Assignment>(
		tx,
		sql`SELECT project_id AS "projectId", ticket_id AS "ticketId", ${runtime} AS runtime, workspace_id AS "workspaceId", terminal_id AS "terminalId", ${session} AS "sessionId", state, ${kind} AS kind FROM ${table} WHERE id=${input.id} FOR UPDATE`,
	);
	if (!run) throw fail("NOT_FOUND", { kind: "external assignment", ref: input.id });
	if (run.runtime === "native")
		throw invalidInput("runtime", "Stop native work through its runtime before you release its assignment.");
	for (const field of ["runtime", "workspaceId", "terminalId", "sessionId"] as const) {
		if (run[field] !== input[field])
			throw invalidInput(field, "The external assignment changed. Read its current identity before you retire it.");
	}
	const existing = await retirementOf(tx, input.source, input.id);
	if (existing) return existing;
	if (run.state === "starting")
		throw invalidInput("id", "Wait for the external launch to finish before you retire its assignment.");
	const project = await projectRow(tx, run.projectId);
	const hostId =
		input.source === "legacy"
			? hostOf(await readAgentSettings(tx), run.projectId)
			: managerConfigOf(project).supersetHostId;
	const retirement: ExternalRetirement = {
		source: input.source,
		id: input.id,
		runtime: input.runtime,
		workspaceId: run.workspaceId,
		terminalId: run.terminalId,
		sessionId: run.sessionId,
		hostId,
		retiredAt: ctx.now.toISOString(),
		actorName: actor.name,
	};
	await record(ctx, tx, {
		rootId: project.root_id,
		projectId: run.projectId,
		ticketId: run.ticketId,
		action: "agent.external-retired",
		changes: [
			{
				field: "assignment",
				from: run.state,
				to: "failed",
				meta: { retirement, previousState: run.state, externalProcessStopped: true },
			},
		],
	});
	const error = `External assignment retired by ${actor.name}. This person confirmed that the external process stopped; Trellis did not observe its exit.`;
	await tx.execute(sql`UPDATE ${table} SET state='failed', error=${error}, updated_at=${ctx.now} WHERE id=${input.id}`);
	if (run.kind === "manager") {
		const config = { ...managerConfigOf(project), dispatchPaused: true };
		await tx.execute(
			sql`UPDATE projects SET manager_config=${JSON.stringify(config)}::jsonb, updated_at=${ctx.now} WHERE id=${run.projectId}`,
		);
		const settings = await readAgentSettings(tx);
		const paused = {
			...settings,
			projects: settings.projects.map((row) => (row.projectId === run.projectId ? { ...row, enabled: false } : row)),
		};
		await tx.execute(
			sql`UPDATE settings SET value=${JSON.stringify(paused)}::jsonb, updated_at=${ctx.now} WHERE key='agents'`,
		);
	}
	if (input.source === "legacy") await announce(ctx, tx, input.id);
	else ctx.emit({ type: "agent-runs.changed", id: input.id });
	return retirement;
};
