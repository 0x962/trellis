import type { LaunchRun } from "../../services/agentRuns/queries.ts";
import { launchPrompt } from "./launchPrompt.ts";
import { expandLaunchTemplate } from "./template.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const resumeText =
	"trellis: your session resumed after a pause. Read the project, its tickets, and its agents again before you act.";

export const launchCommand = (input: {
	run: LaunchRun;
	url: string;
	directory?: string;
	resume?: boolean;
	template: string;
	messageId?: string;
	prompt?: string;
}) => {
	const { run, url } = input;
	const actor = `agent:${run.id}`;
	const prompt = launchPrompt(input);
	if (input.prompt !== undefined && !/\{\{(?:prompt|instruction|resumeText)\}\}/.test(input.template))
		throw new Error(
			"A custom harness command must include {{prompt}}, {{instruction}}, or {{resumeText}} to receive its prompt.",
		);
	const agent = expandLaunchTemplate(input.template, {
		name: run.name,
		id: run.id,
		workspaceId: run.workspaceId ?? "",
		terminalId: run.terminalId ?? "",
		prompt,
		sessionId: run.sessionId!,
		resumeText:
			input.prompt !== undefined
				? prompt
				: run.kind === "session"
					? launchPrompt({ ...input, prompt: "Continue this session in the same conversation and workspace." })
					: launchPrompt({ ...input, prompt: `${run.instruction}\n\n${resumeText}` }),
		actor,
		trellisUrl: url,
		directory: input.directory ?? "",
		project: run.projectKey,
		ticket: run.ticketIdentifier ?? "",
		instruction: input.prompt === undefined ? run.instruction : prompt,
	});
	return {
		prompt,
		command: `${input.directory ? `cd ${quote(input.directory)} && ` : ""}exec env TRELLIS_URL=${quote(url)} TRELLIS_ACTOR=${quote(actor)} ${agent}`,
	};
};
