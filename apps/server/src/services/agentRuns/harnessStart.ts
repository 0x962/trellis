import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun, ProjectManagerConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { commandHarness, readHarness, saveHarness } from "../../agents/commandHarness/commandHarness.ts";
import { runBranch } from "../../agents/launchCommand/branch.ts";
import { launchCommand, resumeText } from "../../agents/launchCommand/launchCommand.ts";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import { shellTarget } from "../../agents/superset/superset.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";
import { exitedSoon, lostSessionMessage, outputTail } from "./resume.ts";

export const startHarness = async (
	ctx: ServiceCtx & { supersetBin: string; localUrl: string },
	input: {
		run: AgentRun;
		config: ProjectManagerConfig;
		context: string;
		resume: boolean;
		repos: { owner: string; repo: string }[];
	},
) => {
	const { config, context, repos } = input;
	let { run } = input;
	const previous = run.workspaceId !== null && run.runtime === "commands" ? await readHarness(ctx.home, run.id) : null;
	const attaching =
		previous !== null &&
		previous.commands.start === config.harnessCommands!.start &&
		previous.agentCommand === config.agentCommand;
	const resume = attaching && input.resume;
	if (!attaching)
		run = { ...run, workspaceId: null, terminalId: null, sessionId: input.resume ? randomUUID() : run.sessionId };
	const commands = config.harnessCommands!;
	const launch = launchCommand({
		run,
		url: ctx.localUrl,
		context,
		directory: run.kind === "manager" ? config.directory : "",
		template: resume ? config.agentResumeCommand : config.agentCommand,
	});
	const runDir = join(ctx.home, "agents", run.id);
	const workDir = run.kind === "manager" && config.directory ? config.directory : join(runDir, "work");
	if (workDir === join(runDir, "work")) await mkdir(workDir, { recursive: true, mode: 0o700 });
	const values = {
		id: run.id,
		sessionId: run.sessionId!,
		resumeText,
		name: run.name,
		project: run.projectPath,
		ticket: run.ticketIdentifier ?? "",
		branch: runBranch(run),
		workDir,
		projectDir: config.directory,
		runDir,
		socket: managedTerminal(ctx.home).socket,
		workspaceId: run.workspaceId ?? "",
		terminalId: run.terminalId ?? "",
		text: "",
		prompt: launch.prompt,
		agentCommand: launch.command,
		actor: `agent:${run.id}`,
		trellisUrl: ctx.localUrl,
		superset: ctx.supersetBin,
		target: shellTarget(config.supersetHostId),
		projectId: "",
		bun: process.execPath,
	};
	await saveHarness(ctx.home, run.id, { commands, values, agentCommand: config.agentCommand });
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET runtime = 'commands', session_id = ${run.sessionId}, workspace_id = ${run.workspaceId}, terminal_id = ${run.terminalId}, url = NULL WHERE id = ${run.id}`,
		),
	);
	let failureState = "failed";
	const started = await attempt(async () => {
		const harness = await commandHarness(ctx.home, run);
		if ((attaching ? commands.resume : commands.start).includes("{{projectId}}")) {
			const matches = (await harness.projects()).filter((project) =>
				repos.some(
					(repo) =>
						project.repo?.replace(/\.git$/, "").toLowerCase() === `https://github.com/${repo.owner}/${repo.repo}`,
				),
			);
			if (matches.length !== 1) throw new Error("The declared repositories must match exactly one harness project.");
			values.projectId = matches[0]!.id;
			await saveHarness(ctx.home, run.id, { commands, values, agentCommand: config.agentCommand });
		}
		failureState = "interrupted";
		return (await commandHarness(ctx.home, run)).start(attaching);
	});
	if (!started.ok) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = ${failureState}, error = ${started.error}, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
			),
		);
		return { id: run.id };
	}
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = 'running', workspace_id = ${started.value.workspaceId}, terminal_id = ${started.value.terminalId}, url = NULL, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
		),
	);
	const current = await ctx.newTx((tx) => getRun(tx, run.id));
	if (resume) {
		const checked = await attempt(async () => {
			const harness = await commandHarness(ctx.home, current);
			if (!(await exitedSoon(async () => (await harness.healthcheck()).state === "exited"))) return null;
			return lostSessionMessage({
				sessionId: run.sessionId!,
				where: `workspace ${current.workspaceId}, directory ${workDir}`,
				printed: outputTail(await harness.output()),
			});
		});
		if (!checked.ok || checked.value !== null) {
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET state = ${checked.ok ? "failed" : "running"}, session_lost = ${checked.ok}, error = ${checked.ok ? checked.value : checked.error}, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
				),
			);
			return { id: run.id };
		}
	}

	const url = await attempt(async () => (await commandHarness(ctx.home, current)).url());
	await ctx.newTx((tx) =>
		url.ok
			? tx.execute(sql`UPDATE agent_runs SET url = ${url.value}, error = NULL WHERE id = ${run.id}`)
			: tx.execute(sql`UPDATE agent_runs SET error = ${url.error} WHERE id = ${run.id}`),
	);
	return { id: run.id };
};
