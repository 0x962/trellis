import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun, AgentRunListInput, AgentRunStartInput, Persona } from "@trellis/api";
import { DEFAULT_AGENT_LAUNCH_COMMAND, hasStandaloneLaunchHyphen } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { runBranch } from "../../agents/launchCommand/branch.ts";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { expandLaunchTemplate } from "../../agents/launchCommand/template.ts";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import { shellTarget, superset } from "../../agents/superset/superset.ts";
import { type ServiceCtx as CoreCtx, requireActor } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { assertProjectActive, chainOf, pathOf, resolveMutableProject, resolveProject, resolveTicket } from "../refs.ts";
import { get as getSettings } from "../settings.ts";
import type { ServiceCtx } from "../support.ts";
import { randomAgentName } from "./names.ts";
import { columns, getRun } from "./queries.ts";

type Ctx = ServiceCtx & { core: CoreCtx; supersetBin: string; localUrl: string };

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	return rows<AgentRun>(
		tx,
		sql`SELECT ${columns} FROM agent_runs WHERE
		${ticket === null ? sql`true` : sql`ticket_id = ${ticket.id}`} AND
		${project === null ? sql`true` : sql`project_id = ${project.id}`} ORDER BY created_at DESC, id DESC`,
	);
};

const reserve = async (ctx: CoreCtx, tx: Tx, input: AgentRunStartInput) => {
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
	if (!config.enabled) throw invalidInput("project", "Turn on agents for this project before you start one.");
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
	if (repos.length === 0) throw invalidInput("project", "Add a repository to the project before you start an agent.");
	const name = randomAgentName();
	await upsert(ctx, tx, actor);
	const [run] = await rows<AgentRun>(
		tx,
		sql`INSERT INTO agent_runs (id, name, persona_id, persona_name, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, state, created_at, updated_at)
		VALUES (${ulid()}, ${name}, ${persona.id}, ${persona.name}, ${persona.kind}, ${persona.instruction}, ${project.id}, ${projectPath}, ${ticket?.id ?? null}, ${ticket?.identifier ?? null}, 'starting', ${ctx.now}, ${ctx.now})
		ON CONFLICT DO NOTHING RETURNING ${columns}`,
	);
	if (run === undefined) throw fail("DUPLICATE", { field: "active agent" });
	const context =
		ticket === null
			? `Project: ${projectPath}\nEffective statuses:\n${JSON.stringify(ctx.cache.effectiveStatuses(project.id).statuses)}\nRead the project and its tickets from Trellis before you act.`
			: `Ticket: ${ticket.identifier}: ${ticket.title}\nProject: ${projectPath}\n\n${ticket.description}\n\nRead the current ticket, comments, and linked pull requests before you act.\nUse trellis brief ${ticket.identifier} for the full task context.`;
	return {
		run,
		repos,
		config,
		context: `${context}\nConcurrency limit: ${config.concurrency} active ticket agents in this project.\nProject directory: ${config.directory || "Use the agent workspace."}\nRepositories: ${repos.map((repo) => `https://github.com/${repo.owner}/${repo.repo}`).join(", ")}`,
	};
};

const recordError = (ctx: Ctx, id: string, error: string, state: AgentRun["state"]) =>
	ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = ${state}, error = ${error}, updated_at = ${ctx.now()} WHERE id = ${id}`,
		),
	);

export const prepareStart = async (ctx: Ctx, input: AgentRunStartInput) => {
	const { run, repos, context, config } = await ctx.newTx((tx) => reserve(ctx.core, tx, input));
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	const runner = superset(ctx.supersetBin, config.supersetHostId);
	const settings = await ctx.newTx((tx) => getSettings(ctx.core, tx));
	// A project that names its own ADE command runs that. Every other
	// project runs the machine's launch command, which starts Superset.
	const template =
		config.ade === "custom" && config.adeCommand !== ""
			? config.adeCommand
			: (settings.agentLaunchCommand ?? DEFAULT_AGENT_LAUNCH_COMMAND);
	if (hasStandaloneLaunchHyphen(template)) {
		await recordError(
			ctx,
			run.id,
			"Remove the standalone hyphen from the launch command. Superset reads it as an unknown option.",
			"failed",
		);
		return { id: run.id };
	}
	const tracksSuperset = template.includes("{{superset}}");
	const project = await attempt(async () => {
		if (run.kind === "manager" && config.directory && !(await stat(config.directory)).isDirectory())
			throw new Error(`Not a directory: ${config.directory}`);
		if (!template.includes("{{projectId}}")) return "";
		const projects = await runner.projects();
		const matches = projects.filter((project) =>
			repos.some(
				(repo) => project.repo?.replace(/\.git$/, "").toLowerCase() === `https://github.com/${repo.owner}/${repo.repo}`,
			),
		);
		if (matches.length !== 1) throw new Error("The declared repositories must match exactly one Superset project.");
		return matches[0]!.id;
	});
	if (!project.ok) {
		await recordError(ctx, run.id, project.error, "failed");
		return { id: run.id };
	}
	const launch = launchCommand({
		run,
		url: ctx.localUrl,
		context,
		directory: run.kind === "manager" ? config.directory : "",
	});
	const workDir =
		run.kind === "manager" && config.directory ? config.directory : join(ctx.home, "agents", run.id, "work");
	const command = expandLaunchTemplate(template, {
		workDir,
		projectDir: config.directory,
		concurrency: String(config.concurrency),
		superset: ctx.supersetBin,
		target: shellTarget(config.supersetHostId),
		projectId: project.value,
		project: run.projectPath,
		ticket: run.ticketIdentifier ?? "",
		name: run.name,
		branch: runBranch(run),
		instruction: run.instruction,
		prompt: launch.prompt,
		actor: `agent:${run.id}`,
		trellisUrl: ctx.localUrl,
		agentCommand: launch.command,
	});
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET runtime = ${tracksSuperset ? "superset" : "tmux"}, workspace_id = ${tracksSuperset ? null : workDir} WHERE id = ${run.id}`,
		),
	);
	const launched = await attempt(() =>
		tracksSuperset
			? runner.create(command)
			: managedTerminal(ctx.home).start(run.id, command, workDir, { url: ctx.localUrl, actor: `agent:${run.id}` }),
	);
	if (!launched.ok) {
		await recordError(ctx, run.id, launched.error, "interrupted");
		return { id: run.id };
	}
	const terminal = launched.value;
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = 'running', workspace_id = ${terminal.workspaceId}, terminal_id = ${terminal.terminalId}, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
		),
	);
	if (!tracksSuperset) return { id: run.id };
	const url = await attempt(() => runner.url(terminal.workspaceId));
	if (url.ok) await ctx.newTx((tx) => tx.execute(sql`UPDATE agent_runs SET url = ${url.value} WHERE id = ${run.id}`));
	else await recordError(ctx, run.id, url.error, "running");
	return { id: run.id };
};

export const finish = async (ctx: Ctx, tx: Tx, input: { id: string }) => {
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return getRun(tx, input.id);
};

export const prepareStop = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	const host = await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId);
	if (run.state === "starting") throw invalidInput("id", "Wait for the agent to finish its startup.");
	if (run.state === "interrupted")
		throw invalidInput("id", "Refresh the status to locate the terminal before you stop this agent.");
	if (run.state === "stopped" || run.state === "exited") return input;
	if (run.workspaceId !== null && run.terminalId !== null) {
		const text =
			run.runtime === "tmux"
				? await managedTerminal(ctx.home).output(run.terminalId)
				: await superset(ctx.supersetBin, host).output(run.workspaceId, run.terminalId);
		const dir = join(ctx.home, "agents", run.id);
		await mkdir(dir, { recursive: true, mode: 0o700 });
		await writeFile(join(dir, "output.txt"), text, { mode: 0o600 });
		if (run.runtime === "tmux") await managedTerminal(ctx.home).stop(run.terminalId);
		else await superset(ctx.supersetBin, host).stop(run.workspaceId, run.terminalId);
	}
	await ctx.newTx((tx) =>
		tx.execute(sql`UPDATE agent_runs SET state = 'stopped', updated_at = ${ctx.now()} WHERE id = ${input.id}`),
	);
	return input;
};

export const prepareRefresh = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	const host = await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId);
	const runner = superset(ctx.supersetBin, host);
	if (run.state === "interrupted" && run.runtime === "superset") {
		const recovered = await attempt(() => runner.recover(runBranch(run), run.name));
		if (!recovered.ok) {
			await recordError(ctx, run.id, recovered.error, "interrupted");
			return input;
		}
		const found = recovered.value;
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET workspace_id = ${found.workspaceId}, terminal_id = ${found.terminalId}, state = ${found.exited ? "exited" : "running"}, error = NULL WHERE id = ${run.id}`,
			),
		);
		const url = await attempt(() => runner.url(found.workspaceId));
		if (url.ok) await ctx.newTx((tx) => tx.execute(sql`UPDATE agent_runs SET url = ${url.value} WHERE id = ${run.id}`));
		return input;
	}
	if (run.state !== "running" && run.state !== "interrupted") return input;
	if (run.state === "interrupted" && run.runtime === "tmux")
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET terminal_id = ${run.id}, workspace_id = COALESCE(workspace_id, ${join(ctx.home, "agents", run.id, "work")}) WHERE id = ${run.id}`,
			),
		);
	const exited = await attempt(() =>
		run.runtime === "tmux"
			? managedTerminal(ctx.home).exited(run.id)
			: runner.exited(run.workspaceId!, run.terminalId!),
	);
	if (!exited.ok) await recordError(ctx, run.id, exited.error, run.state);
	else
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = ${exited.value ? "exited" : "running"}, error = NULL, updated_at = ${ctx.now()} WHERE id = ${input.id}`,
			),
		);
	return input;
};
