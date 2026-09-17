import { randomUUID } from "node:crypto";
import type { AgentRunStartInput } from "@trellis/api";
import { HarnessSchema, supportsModel } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type ServiceCtx as CoreCtx, requireActor } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { assignment } from "../controller/nextActions/assignment.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { activeNotes } from "../notes/notes.ts";
import { notesLines } from "../notes/text.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive, chainOf, pathOf, resolveMutableProject, resolveTicket } from "../refs.ts";
import { assertAssignmentOwner } from "../submanagers/access.ts";
import { columns, type StoredRun } from "./queries.ts";

// The newest manager row is the current assignment; older rows retain their history.
export const managerRowOf = async (tx: Tx, projectId: string, delegated: boolean | null = false) =>
	(
		await rows<StoredRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE project_id = ${projectId} AND kind = 'manager' AND ${delegated === null ? sql`true` : delegated ? sql`EXISTS (SELECT 1 FROM manager_delegations d WHERE d.run_id=agent_runs.id AND d.retired_at IS NULL)` : sql`NOT EXISTS (SELECT 1 FROM manager_delegations d WHERE d.run_id=agent_runs.id)`} ORDER BY created_at DESC, id DESC LIMIT 1`,
		)
	).at(0);

export const reserve = async (
	ctx: CoreCtx,
	tx: Tx,
	input: AgentRunStartInput,
	confirmedExited: string[] = [],
	options?: {
		copilot?: boolean;
		delegated?: boolean;
		flow?: { name: string; instruction: string };
		session?: { name: string; instruction: string; fingerprint: string };
		config?: Awaited<ReturnType<typeof projectLaunchConfig>>;
	},
) => {
	const actor = requireActor(ctx);
	if (input.project && actor.kind === "agent" && !options?.delegated && !options?.session) {
		const manager = await rows(tx, sql`SELECT id FROM agent_runs WHERE id=${actor.name} AND kind='manager'`);
		if (manager.length) throw invalidInput("project", "Use submanagers.start to delegate a project subtree.");
	}
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = await resolveMutableProject(ctx, tx, ticket?.projectId ?? input.project!);
	const kind = options?.session ? "session" : ticket === null ? "manager" : options?.flow ? "flow" : "agent";
	const name = options?.session?.name ?? options?.flow?.name ?? (kind === "manager" ? "Manager" : "Agent");
	if (kind === "manager" && !options?.delegated && !options?.copilot) {
		const delegated = await rows(
			tx,
			sql`SELECT run_id FROM manager_delegations WHERE project_id=${project.id} AND retired_at IS NULL`,
		);
		if (delegated.length)
			throw invalidInput("project", "Retire the current delegation before you start an independent manager.");
	}
	await tx.execute(sql`SELECT id FROM projects WHERE id = ${project.id} FOR UPDATE`);
	const request = {
		requestId: input.requestId,
		target: {
			projectId: project.id,
			ticketId: ticket?.id ?? null,
			newSession: input.newSession === true,
			accountId: input.accountId ?? null,
			sessionFingerprint: options?.session?.fingerprint,
		},
	};
	const replay =
		(await assignment(ctx, tx, {
			requestId: input.requestId,
			ticketId: ticket?.id ?? null,
			accountId: input.accountId,
		})) ?? (await replayRequest(ctx, tx, request));
	if (replay) return { replay: true as const, run: replay };
	assertProjectActive(ctx, project.id);
	let config = options?.config ?? (await projectLaunchConfig(tx, { projectId: project.id }));
	if (input.harness) config = { ...config, harness: HarnessSchema.parse(input.harness), accountId: null };
	if (kind === "agent") {
		await assertAssignmentOwner(ctx, tx, project.id);
		const assigned = await rows(
			tx,
			sql`SELECT id FROM agent_runs WHERE ticket_id=${ticket!.id} AND kind='agent' AND closed_at IS NULL LIMIT 1`,
		);
		if (assigned.length > 0) throw fail("DUPLICATE", { field: "active agent assignment on this ticket" });
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
	let existing =
		kind === "manager" ? await managerRowOf(tx, project.id, options?.copilot ? null : options?.delegated) : undefined;
	if (existing !== undefined && existing.runtime === "native" && existing.closedAt === null)
		throw fail("DUPLICATE", { field: "active agent" });
	if (existing && existing.runtime !== "native") existing = undefined;
	if (existing !== undefined && input.newSession === true && actor.kind !== "human" && !options?.copilot)
		throw invalidInput(
			"newSession",
			"Only a person can reset an existing manager conversation. Resume it without newSession to preserve its context.",
		);
	if (existing?.terminalId && !confirmedExited.includes(existing.terminalId))
		throw invalidInput("project", "Confirm the prior process stopped before you replace this manager.");
	const resume =
		existing !== undefined &&
		existing.terminalId !== null &&
		existing.workspaceId !== null &&
		input.newSession !== true;
	// An account named on the request wins, then the account of the project,
	// then the account a resumed manager already has. A project account moves
	// a manager at its next restart; the launch transfers its session.
	const selected = await selectAccount(tx, {
		accountId: input.accountId ?? config.accountId ?? (resume ? existing?.accountId : undefined),
		config,
		useDefault: !resume,
	});
	config = selected.config;
	if (input.model !== undefined) {
		if (config.harness.preset === "custom")
			throw invalidInput("model", "A custom command does not support a model override. Select a native harness.");
		if (!supportsModel(config.harness.preset, input.model))
			throw invalidInput("model", `Select a model supported by ${config.harness.preset} from models.list.`);
		config = { ...config, harness: { ...config.harness, model: input.model, effort: undefined } };
	}
	const previousAttemptId = existing?.terminalId ?? null;
	const sessionId = resume ? existing!.sessionId! : config.harness.preset === "custom" ? randomUUID() : null;
	const [run] =
		existing === undefined
			? await rows<StoredRun>(
					tx,
					sql`INSERT INTO agent_runs (id, name, harness, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, runtime, closed_at, session_id, created_at, updated_at)
		VALUES (${ulid()}, ${name}, ${JSON.stringify(config.harness)}::jsonb, ${kind}, ${options?.session?.instruction ?? options?.flow?.instruction ?? (kind === "manager" ? config.instruction : "")}, ${project.id}, ${projectPath}, ${ticket?.id ?? null}, ${ticket?.identifier ?? null}, 'native', NULL, ${sessionId}, ${ctx.now}, ${ctx.now})
		ON CONFLICT DO NOTHING RETURNING ${columns}`,
				)
			: // The current project instruction applies when a manager starts again.
				await rows<StoredRun>(
					tx,
					sql`UPDATE agent_runs SET closed_at = NULL, error = NULL, session_lost = false, session_id = ${sessionId},
			name = ${name}, harness = ${JSON.stringify(config.harness)}::jsonb, instruction = ${config.instruction}, updated_at = ${ctx.now}
			WHERE id = ${existing.id} RETURNING ${columns}`,
				);
	if (run === undefined) throw fail("DUPLICATE", { field: "active agent" });
	const attempt = await reserveAttempt(ctx, tx, { runId: run.id });
	await tx.execute(
		sql`UPDATE agent_runs SET runtime = 'native', terminal_id = ${attempt.id},account_id=${selected.accountId} WHERE id = ${run.id}`,
	);
	run.accountId = selected.accountId;
	run.runtime = "native";
	run.terminalId = attempt.id;
	await recordRequest(ctx, tx, { ...request, runId: run.id });
	if (kind === "agent")
		await tx.execute(sql`UPDATE manager_next_actions a SET state='assigned',run_id=${run.id},assigned_at=${ctx.now}
 WHERE ticket_id=${ticket!.id} AND state='waiting' AND status_id=${ticket!.statusId}
 AND (${actor.kind === "human"} OR EXISTS (SELECT 1 FROM agent_runs manager WHERE manager.id=${actor.name}
 AND manager.kind='manager' AND manager.project_id=a.project_id AND manager.closed_at IS NULL))`);
	const context =
		ticket === null
			? `Project: ${projectPath}\nEffective statuses:\n${JSON.stringify(ctx.cache.effectiveStatuses(project.id).statuses)}`
			: `Ticket: ${ticket.identifier}: ${ticket.title}\nProject: ${projectPath}\n\n${ticket.description}\n\nRead the current ticket, comments, and linked pull requests before you act.\nUse trellis brief ${ticket.identifier} for the full task context.`;
	// The notes of the project chain for this kind of agent, so the agent
	// starts with what earlier agents and people wrote for it.
	const notes = notesLines(
		await activeNotes(ctx, tx, { projectId: project.id, audience: kind === "manager" ? "manager" : "worker" }),
		projectPath,
	);
	return {
		replay: false as const,
		run,
		attempt,
		repos,
		config,
		resume,
		previousAttemptId,
		previousAccountId: existing?.accountId ?? null,
		context: `${context}\nProject directory: ${config.directory || (ticket === null ? "Not configured" : "Use the agent workspace.")}\nRepositories: ${repos.map((repo) => `https://github.com/${repo.owner}/${repo.repo}`).join(", ")}${notes.length === 0 ? "" : `\n\n${notes.join("\n")}`}`,
	};
};
