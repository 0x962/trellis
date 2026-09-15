import type { AgentRun } from "@trellis/api";
import { nativeInstructions } from "./nativeInstructions.ts";
import { expandLaunchTemplate } from "./template.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

// What a manager reads first after a pause. The agent holds the chat of the
// session, so the text names only what changed while the manager was away.
export const resumeText =
	"trellis: your session resumed after a pause. Read the project, its tickets, and its agents again before you act.";

// `template` is the agent command of the project: the program that is one
// agent, with the variables of AGENT_COMMAND_VARIABLES. trellis wraps it
// with the directory and the environment the agent needs to reach trellis,
// and owns nothing else about what runs. `resume` is true for a manager
// that ran before: the template is then the resume command of the
// project, and `resumeText` is what the agent reads first.
export const launchCommand = (input: {
	run: AgentRun;
	url: string;
	context: string;
	directory?: string;
	resume?: boolean;
	template: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prompt = `${run.instruction}\n\n# Assignment\n\nYour name is ${run.name}. Your Trellis actor is ${actor}.\nTrellis URL: ${url}\nPersona: ${run.personaName} (${run.kind})\n\n${context}\n\nUse TRELLIS_URL and TRELLIS_ACTOR for every Trellis command. Read the repository's AGENTS.md before work.\n${nativeInstructions}`;
	const agent = expandLaunchTemplate(input.template, {
		name: run.name,
		id: run.id,
		workspaceId: run.workspaceId ?? "",
		terminalId: run.terminalId ?? "",
		prompt,
		sessionId: run.sessionId!,
		resumeText,
		actor,
		trellisUrl: url,
		directory: input.directory ?? "",
		project: run.projectPath,
		ticket: run.ticketIdentifier ?? "",
		instruction: run.instruction,
	});
	return {
		prompt,
		command: `${input.directory ? `cd ${quote(input.directory)} && ` : ""}exec env TRELLIS_URL=${quote(url)} TRELLIS_ACTOR=${quote(actor)} ${agent}`,
	};
};
