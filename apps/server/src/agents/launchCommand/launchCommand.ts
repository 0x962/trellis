import type { LaunchRun } from "../../services/agentRuns/types.ts";
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
}) => {
	const { run, url } = input;
	const actor = `agent:${run.id}`;
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	const prompt = launchPrompt(input);
	const agent = expandLaunchTemplate(input.template, {
		name: run.name,
		id: run.id,
		workspaceId: run.workspaceId ?? "",
		terminalId: run.terminalId ?? "",
		prompt,
		sessionId: run.sessionId!,
		resumeText:
			run.kind === "session"
				? `${prefix}Continue this session in the same conversation and workspace.`
				: `${prefix}${run.instruction}\n\n${resumeText}`,
		actor,
		trellisUrl: url,
		directory: input.directory ?? "",
		project: run.projectKey,
		ticket: run.ticketIdentifier ?? "",
		instruction: run.instruction,
	});
	return {
		prompt,
		command: `${input.directory ? `cd ${quote(input.directory)} && ` : ""}exec env TRELLIS_URL=${quote(url)} TRELLIS_ACTOR=${quote(actor)} ${agent}`,
	};
};
