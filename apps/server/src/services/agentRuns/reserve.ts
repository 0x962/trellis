import { randomUUID } from "node:crypto";
import type { AgentRunStartInput, Persona } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type ServiceCtx as CoreCtx, requireActor } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { assertProjectActive, chainOf, pathOf, resolveMutableProject, resolveTicket } from "../refs.ts";
import { randomAgentName } from "./names.ts";
import { assertNativeWorkEnabled } from "./nativeControl.ts";
import { columns, type StoredRun } from "./queries.ts";

// The newest manager row is the current assignment; older rows retain their history.
export const managerRowOf = async (tx: Tx, projectId: string) =>
	(
		await rows<StoredRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE project_id = ${projectId} AND kind = 'manager' ORDER BY created_at DESC, id DESC LIMIT 1`,
		)
	).at(0);

export const reserve = async (ctx: CoreCtx, tx: Tx, input: AgentRunStartInput) => {
	const actor = requireActor(ctx);
	const [persona] = await rows<Persona>(
		tx,
		sql`SELECT id, name, kind, instruction FROM personas WHERE id = ${input.personaId}`,
	);
	if (persona === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.personaId });
	if ((persona.kind === "manager") !== (input.project !== undefined))
		throw invalidInput("personaId", "Select a manager for a project, or a builder or reviewer for a ticket.");
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = await resolveMutableProject(ctx, tx, ticket?.projectId ?? input.project!);
	await tx.execute(sql`SELECT id FROM projects WHERE id = ${project.id} FOR UPDATE`);
	const request = {
		requestId: input.requestId,
		target: {
			personaId: persona.id,
			projectId: project.id,
			ticketId: ticket?.id ?? null,
			newSession: input.newSession === true,
		},
	};
	const replay = await replayRequest(ctx, tx, request);
	if (replay) return { replay: true as const, run: replay };
	assertProjectActive(ctx, project.id);
	if (ticket?.completedAt != null) throw invalidInput("ticket", "Reopen the ticket before you assign an agent.");
	const config = managerConfigOf(await projectRow(tx, project.id));
	await assertNativeWorkEnabled(tx);
	if (ticket !== null) {
		const [active] = await rows<{ count: number }>(
			tx,
			sql`SELECT count(*)::int AS count FROM agent_runs WHERE project_id = ${project.id} AND kind <> 'manager' AND runtime = 'native' AND closed_at IS NULL`,
		);
		if (active!.count >= config.concurrency) throw fail("DUPLICATE", { field: "project concurrency limit" });
	}
	const projectPath = pathOf(ctx.cache, project.id);
	const ids = chainOf(ctx.cache, project.id).map((item) => item.id);
	const repos = await rows<{ owner: string; repo: string }>(
		tx,
		sql`SELECT owner, repo FROM repos WHERE project_id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)})`,
	);
	await upsert(ctx, tx, actor);
	let existing = persona.kind === "manager" ? await managerRowOf(tx, project.id) : undefined;
	if (existing !== undefined && existing.runtime === "native" && existing.closedAt === null)
		throw fail("DUPLICATE", { field: "active agent" });
	if (existing && existing.runtime !== "native") existing = undefined;
	const resume =
		existing !== undefined &&
		existing.terminalId !== null &&
		existing.workspaceId !== null &&
		input.newSession !== true;
	const previousAttemptId = existing?.terminalId ?? null;
	const sessionId = resume ? existing!.sessionId! : config.harness.preset === "custom" ? randomUUID() : null;
	const [run] =
		existing === undefined
			? await rows<StoredRun>(
					tx,
					sql`INSERT INTO agent_runs (id, name, persona_id, persona_name, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, runtime, closed_at, session_id, created_at, updated_at)
		VALUES (${ulid()}, ${randomAgentName()}, ${persona.id}, ${persona.name}, ${persona.kind}, ${persona.instruction}, ${project.id}, ${projectPath}, ${ticket?.id ?? null}, ${ticket?.identifier ?? null}, 'native', NULL, ${sessionId}, ${ctx.now}, ${ctx.now})
		ON CONFLICT DO NOTHING RETURNING ${columns}`,
				)
			: // A person can change the persona between two starts, so the row
				// takes the current persona and its instruction. The error of the
				// last start goes.
				await rows<StoredRun>(
					tx,
					sql`UPDATE agent_runs SET closed_at = NULL, error = NULL, session_lost = false, session_id = ${sessionId},
			persona_id = ${persona.id}, persona_name = ${persona.name}, instruction = ${persona.instruction}, updated_at = ${ctx.now}
			WHERE id = ${existing.id} RETURNING ${columns}`,
				);
	if (run === undefined) throw fail("DUPLICATE", { field: "active agent" });
	const attempt = await reserveAttempt(ctx, tx, { runId: run.id });
	await tx.execute(sql`UPDATE agent_runs SET runtime = 'native', terminal_id = ${attempt.id} WHERE id = ${run.id}`);
	run.runtime = "native";
	run.terminalId = attempt.id;
	await recordRequest(ctx, tx, { ...request, runId: run.id });
	const context =
		ticket === null
			? `Project: ${projectPath}\nEffective statuses:\n${JSON.stringify(ctx.cache.effectiveStatuses(project.id).statuses)}\nRead the project and its tickets from Trellis before you act.\nUse a stable --request-id for each worker assignment. Reuse it when a start result is uncertain. Use a different ID for an intentional new assignment.`
			: `Ticket: ${ticket.identifier}: ${ticket.title}\nProject: ${projectPath}\n\n${ticket.description}\n\nRead the current ticket, comments, and linked pull requests before you act.\nUse trellis brief ${ticket.identifier} for the full task context.`;
	return {
		replay: false as const,
		run,
		attempt,
		repos,
		config,
		resume,
		previousAttemptId,
		context: `${context}\nConcurrency limit: ${config.concurrency} active ticket agents in this project.\nProject directory: ${config.directory || "Use the agent workspace."}\nRepositories: ${repos.map((repo) => `https://github.com/${repo.owner}/${repo.repo}`).join(", ")}`,
	};
};
