import { randomUUID } from "node:crypto";
import type { AgentRun, AgentRunStartInput, Persona } from "@trellis/api";
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
import { columns } from "./queries.ts";

// The one manager row of a project: the newest row of the kind. A project
// keeps one manager, so every start takes this row again. A database from
// before that rule can hold older manager rows, which a start leaves as
// history.
export const managerRowOf = async (tx: Tx, projectId: string) =>
	(
		await rows<AgentRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE project_id = ${projectId} AND kind = 'manager' ORDER BY created_at DESC, id DESC LIMIT 1`,
		)
	).at(0);

// Writes the row a start runs, and answers it with what the launch needs.
// `resume` is true when the row keeps its Claude session: the launch then
// continues that session in place of a new one.
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
	if (persona.kind === "manager") {
		const [legacy] = await rows<{ id: string }>(
			tx,
			sql`SELECT id FROM agent_sessions WHERE project_id = ${project.id} AND role = 'manager' AND state IN ('starting', 'running', 'waiting') LIMIT 1`,
		);
		if (legacy !== undefined) throw fail("DUPLICATE", { field: "active manager" });
	}
	if (ticket?.completedAt != null) throw invalidInput("ticket", "Reopen the ticket before you assign an agent.");
	const config = managerConfigOf(await projectRow(tx, project.id));
	if (config.ade === "native") await assertNativeWorkEnabled(tx);
	if (ticket !== null) {
		const [active] = await rows<{ count: number }>(
			tx,
			sql`SELECT count(*)::int AS count FROM agent_runs WHERE project_id = ${project.id} AND kind <> 'manager' AND state IN ('starting', 'running', 'interrupted')`,
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
	if (repos.length === 0 && config.ade !== "native")
		throw invalidInput("project", "Add a repository to the project before you start an agent.");
	await upsert(ctx, tx, actor);
	let existing = persona.kind === "manager" ? await managerRowOf(tx, project.id) : undefined;
	if (existing && config.ade !== "native") {
		const [protectedRun] = await rows<{ id: string }>(
			tx,
			sql`SELECT id FROM agent_execution_attempts WHERE run_id = ${existing.id} LIMIT 1`,
		);
		if (protectedRun) {
			if (existing.state !== "stopped" || input.newSession !== true)
				throw invalidInput(
					"newSession",
					"Stop the native manager and select a new session before you switch its runtime.",
				);
			existing = undefined;
		}
	}
	if (existing?.runtime === "native" && existing.state === "interrupted")
		throw invalidInput("project", "Reconcile the interrupted native manager before you start a replacement.");
	// A manager that holds its terminal is the one that runs. A second start
	// would take its row and leave that terminal with no row. An interrupted
	// manager has no terminal the server can find, so a start takes it.
	if (existing !== undefined && (existing.state === "starting" || existing.state === "running"))
		throw fail("DUPLICATE", { field: "active agent" });
	// The row keeps its session across every pause, so the person keeps the
	// chat they had. A new session replaces it on request, and when the row
	// never had one. A row with no workspace never ran an agent, so its
	// session holds no chat to continue.
	const resume =
		existing !== undefined && existing.sessionId !== null && existing.workspaceId !== null && input.newSession !== true;
	const sessionId = resume ? existing!.sessionId! : randomUUID();
	const [run] =
		existing === undefined
			? await rows<AgentRun>(
					tx,
					sql`INSERT INTO agent_runs (id, name, persona_id, persona_name, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, state, session_id, created_at, updated_at)
		VALUES (${ulid()}, ${randomAgentName()}, ${persona.id}, ${persona.name}, ${persona.kind}, ${persona.instruction}, ${project.id}, ${projectPath}, ${ticket?.id ?? null}, ${ticket?.identifier ?? null}, 'starting', ${sessionId}, ${ctx.now}, ${ctx.now})
		ON CONFLICT DO NOTHING RETURNING ${columns}`,
				)
			: // A person can change the persona between two starts, so the row
				// takes the current persona and its instruction. The error of the
				// last start goes.
				await rows<AgentRun>(
					tx,
					sql`UPDATE agent_runs SET state = 'starting', error = NULL, session_lost = false, session_id = ${sessionId},
			persona_id = ${persona.id}, persona_name = ${persona.name}, instruction = ${persona.instruction}, updated_at = ${ctx.now}
			WHERE id = ${existing.id} RETURNING ${columns}`,
				);
	if (run === undefined) throw fail("DUPLICATE", { field: "active agent" });
	const attempt = config.ade === "native" ? await reserveAttempt(ctx, tx, { runId: run.id }) : null;
	if (attempt) {
		await tx.execute(sql`UPDATE agent_runs SET runtime = 'native', terminal_id = ${attempt.id} WHERE id = ${run.id}`);
		run.runtime = "native";
		run.terminalId = attempt.id;
	}
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
		context: `${context}\nConcurrency limit: ${config.concurrency} active ticket agents in this project.\nProject directory: ${config.directory || "Use the agent workspace."}\nRepositories: ${repos.map((repo) => `https://github.com/${repo.owner}/${repo.repo}`).join(", ")}`,
	};
};
