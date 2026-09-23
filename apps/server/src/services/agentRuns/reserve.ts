import { randomUUID } from "node:crypto";
import { HarnessSchema, supportsModel } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { runBranch } from "../../agents/launchCommand/branch.ts";
import { type ServiceCtx as CoreCtx, requireActor } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { assignmentInstruction } from "../brief.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive, resolveMutableProject, resolveTicket } from "../refs.ts";
import { columns, type LaunchRun } from "./queries.ts";

type ReserveInput = {
	harness?: unknown;
	model?: string;
	accountId?: string;
	requestId?: string;
	ticket?: string;
	project?: string;
};

export const reserve = async (
	ctx: CoreCtx,
	tx: Tx,
	input: ReserveInput,
	_confirmedExited: string[] = [],
	options?: {
		flow?: { name: string; instruction: string };
		session?: { name: string; instruction: string; fingerprint: string };
		config?: Awaited<ReturnType<typeof projectLaunchConfig>>;
	},
) => {
	const actor = requireActor(ctx);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = await resolveMutableProject(ctx, tx, ticket?.projectId ?? input.project!);
	const kind = options?.session ? "session" : options?.flow ? "flow" : "agent";
	const name = options?.session?.name ?? options?.flow?.name ?? "Agent";
	const request = {
		requestId: input.requestId,
		target: {
			projectId: project.id,
			ticketId: ticket?.id ?? null,
			newSession: false,
			accountId: input.accountId ?? null,
			sessionFingerprint: options?.session?.fingerprint,
		},
	};
	const replay = await replayRequest(ctx, tx, request);
	if (replay) return { replay: true as const, run: replay };
	assertProjectActive(ctx, project.id);
	let config =
		options?.config ??
		(await projectLaunchConfig(tx, {
			projectId: project.id,
			harness: HarnessSchema.parse(input.harness ?? { preset: "claude" }),
		}));
	if (input.harness) config = { ...config, harness: HarnessSchema.parse(input.harness), accountId: null };
	if (kind === "agent") {
		if (ticket!.completedAt !== null) throw invalidInput("ticket", "Reopen the ticket before an agent starts.");
		// This read gives the DUPLICATE error early, before the reservation
		// does its work. The INSERT below applies the rule.
		const assigned = await rows(
			tx,
			sql`SELECT id FROM agent_runs WHERE ticket_id=${ticket!.id} AND kind='agent' AND closed_at IS NULL LIMIT 1`,
		);
		if (assigned.length > 0) throw fail("DUPLICATE", { field: "active agent assignment on this ticket" });
	}
	const projectKey = ctx.cache.get(project.id).key;
	await upsert(ctx, tx, actor);
	const selected = await selectAccount(tx, {
		accountId: input.accountId,
		config,
		useDefault: true,
	});
	config = selected.config;
	if (input.model !== undefined) {
		if (config.harness.preset === "custom")
			throw invalidInput("model", "A custom command does not support a model override. Select a native harness.");
		if (!supportsModel(config.harness.preset, input.model))
			throw invalidInput("model", `Select a model supported by ${config.harness.preset} from models.list.`);
		config = { ...config, harness: { ...config.harness, model: input.model, effort: undefined } };
	}
	const sessionId = config.harness.preset === "custom" ? randomUUID() : null;
	// `nativeWorkspace` creates the Git worktree of the run on the branch that
	// `runBranch` builds from the run id. The instruction of a ticket
	// assignment names that branch, so the id exists before the INSERT.
	const id = ulid();
	const instruction =
		options?.session?.instruction ??
		options?.flow?.instruction ??
		assignmentInstruction({
			identifier: ticket!.identifier,
			title: ticket!.title,
			description: ticket!.description,
			projectKey,
			branch: runBranch({ id, kind, ticketIdentifier: ticket!.identifier }),
			publicUrl: ctx.publicUrl,
		});
	// `ON CONFLICT` returns no row when `agent_runs_active_ticket_idx` already
	// has an open agent run for this ticket. A ticket can have only one. The
	// target names that index, so a violation of another constraint throws its
	// own error instead of reading as a duplicate agent.
	const [run] = await rows<LaunchRun>(
		tx,
		sql`INSERT INTO agent_runs (id, name, harness, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, runtime, closed_at, session_id, created_at, updated_at)
		VALUES (${id}, ${name}, ${JSON.stringify(config.harness)}::jsonb, ${kind}, ${instruction}, ${project.id}, ${projectKey}, ${ticket?.id ?? null}, ${ticket?.identifier ?? null}, 'native', NULL, ${sessionId}, ${ctx.now}, ${ctx.now})
		ON CONFLICT (ticket_id) WHERE kind = 'agent' AND closed_at IS NULL DO NOTHING RETURNING ${columns}`,
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
	return {
		replay: false as const,
		run,
		attempt,
		config,
		resume: false,
		previousAttemptId: null,
		previousAccountId: null,
	};
};
