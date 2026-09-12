import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun, AgentRunListInput, AgentRunStartInput } from "@trellis/api";
import {
	DEFAULT_AGENT_LAUNCH_COMMAND,
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	hasStandaloneLaunchHyphen,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { runBranch } from "../../agents/launchCommand/branch.ts";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { expandLaunchTemplate } from "../../agents/launchCommand/template.ts";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import { shellTarget, superset } from "../../agents/superset/superset.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import { get as getSettings } from "../settings.ts";
import type { ServiceCtx } from "../support.ts";
import { startHarness } from "./harnessStart.ts";
import { columns, getRun } from "./queries.ts";
import { reserve } from "./reserve.ts";
import { exitedSoon, lostSessionMessage, outputTail } from "./resume.ts";

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

const recordError = (ctx: Ctx, id: string, error: string, state: AgentRun["state"]) =>
	ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = ${state}, error = ${error}, updated_at = ${ctx.now()} WHERE id = ${id}`,
		),
	);

export const prepareStart = async (ctx: Ctx, input: AgentRunStartInput) => {
	const { run, repos, context, config, resume } = await ctx.newTx((tx) => reserve(ctx.core, tx, input));
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	if (config.harnessCommands !== null) return startHarness(ctx, { run, repos, context, config, resume });
	const runner = superset(ctx.supersetBin, config.supersetHostId);
	const settings = await ctx.newTx((tx) => getSettings(ctx.core, tx));
	// A project that names its own ADE command runs that. A run that has a
	// workspace runs the resume command of that ADE, which opens the agent
	// again in that workspace; an ADE with none runs its launch command
	// again. Every other project runs the machine's launch command, which
	// starts Superset.
	const template =
		config.ade === "custom" && config.adeCommand !== ""
			? run.workspaceId !== null && config.adeResumeCommand !== ""
				? config.adeResumeCommand
				: config.adeCommand
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
	const runtime = tracksSuperset ? "superset" : "tmux";
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
	// A manager that ran before keeps its Superset workspace, because the
	// workspace branch carries the run id and Superset holds one workspace
	// per branch. The start then opens one more terminal in that workspace,
	// and that terminal runs the agent command alone. Every other start runs
	// the whole launch template, which makes the workspace first.
	const attaching = tracksSuperset && run.workspaceId !== null && run.runtime === "superset";
	// The agent command of the project is the program that is one agent.
	// trellis names the session and hands it over; the command decides what
	// its agent does with it. An empty command runs Claude Code.
	const launch = launchCommand({
		run,
		url: ctx.localUrl,
		context,
		directory: run.kind === "manager" ? config.directory : "",
		resume,
		template: resume
			? config.agentResumeCommand || DEFAULT_AGENT_RESUME_COMMAND
			: config.agentCommand || DEFAULT_AGENT_START_COMMAND,
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
		sessionId: run.sessionId!,
		workspaceId: run.workspaceId ?? "",
	});
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET runtime = ${runtime}, workspace_id = ${attaching ? run.workspaceId : tracksSuperset ? null : workDir} WHERE id = ${run.id}`,
		),
	);
	// Where the server told the agent to run, for the error of a resume that
	// found no session there.
	const host = config.supersetHostId === null ? "this machine" : `Superset host ${config.supersetHostId}`;
	const where = (workspaceId: string) =>
		tracksSuperset
			? `Superset workspace ${workspaceId} on ${host}${config.directory ? `, directory ${config.directory}` : ""}`
			: `directory ${workDir} on this machine`;
	const launched = await attempt(() =>
		attaching
			? runner.terminal(run.workspaceId!, launch.command)
			: tracksSuperset
				? runner.create(command)
				: managedTerminal(ctx.home).start(run.id, command, workDir, { url: ctx.localUrl, actor: `agent:${run.id}` }),
	);
	if (!launched.ok) {
		// A terminal that Superset refused to open in the workspace of the
		// run never started, so the row is failed and the person may start a
		// new session. A launch template that failed may have made the
		// workspace, so the row is interrupted until a refresh finds it.
		if (attaching)
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET state = 'failed', session_lost = true, error = ${`Could not open a terminal in ${where(run.workspaceId!)}: ${launched.error}`}, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
				),
			);
		else await recordError(ctx, run.id, launched.error, "interrupted");
		return { id: run.id };
	}
	const terminal = launched.value;
	if (resume) {
		const exited = () =>
			runtime === "tmux"
				? managedTerminal(ctx.home).exited(terminal.terminalId)
				: runner.exited(terminal.workspaceId, terminal.terminalId);
		if (await exitedSoon(exited)) {
			const printed =
				runtime === "tmux"
					? await managedTerminal(ctx.home).output(terminal.terminalId)
					: await runner.output(terminal.workspaceId, terminal.terminalId);
			const error = lostSessionMessage({
				sessionId: run.sessionId!,
				where: where(terminal.workspaceId),
				printed: outputTail(printed),
			});
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET state = 'failed', session_lost = true, error = ${error}, workspace_id = ${terminal.workspaceId}, terminal_id = ${terminal.terminalId}, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
				),
			);
			return { id: run.id };
		}
	}
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
