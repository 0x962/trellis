import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { LaunchRun } from "../agentRuns/queries.ts";
import type { IoCtx, ServiceCtx } from "../support.ts";
import { agentPrompt } from "./agentPrompt.ts";

const exec = promisify(execFile);

export async function launchGuide(
	ctx: ServiceCtx & Pick<IoCtx, "core">,
	input: {
		run: LaunchRun;
		workspace: string;
		attemptId: string;
		message?: string;
		env: NodeJS.ProcessEnv;
	},
) {
	const request =
		input.run.kind === "agent"
			? "Complete the assigned ticket described in the full ticket context. Record the result."
			: input.run.instruction;
	const branch = existsSync(join(input.workspace, ".git"))
		? (
				await exec("git", ["-C", input.workspace, "rev-parse", "--abbrev-ref", "HEAD"], { env: input.env })
			).stdout.trim()
		: "None";
	return ctx.newTx((tx) =>
		agentPrompt({ ...ctx.core, now: ctx.now() }, tx, {
			run: input.run,
			workspace: input.workspace,
			branch,
			attemptId: input.attemptId,
			host: hostname(),
			request:
				input.message === undefined || input.message === request
					? request
					: `${request}\n\n### Current message\n\n${input.message}`,
		}),
	);
}
