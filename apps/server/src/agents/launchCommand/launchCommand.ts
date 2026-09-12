import type { AgentRun } from "@trellis/api";
import { expandLaunchTemplate } from "./template.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const launchCommand = (input: {
	run: AgentRun;
	url: string;
	context: string;
	directory?: string;
	commandTemplate: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prompt = `${run.instruction}\n\n# Assignment\n\nYour name is ${run.name}. Your Trellis actor is ${actor}.\nTrellis URL: ${url}\nPersona: ${run.personaName} (${run.kind})\n\n${context}\n\nUse TRELLIS_URL and TRELLIS_ACTOR for every Trellis command. Read the repository's AGENTS.md before work.\n`;
	const command = expandLaunchTemplate(input.commandTemplate, {
		name: run.name,
		prompt,
		id: run.id,
		project: run.projectPath,
		ticket: run.ticketIdentifier ?? "",
		actor,
		trellisUrl: url,
		workspaceId: run.workspaceId ?? "",
		terminalId: run.terminalId ?? "",
	});
	return {
		prompt,
		command: `${input.directory ? `cd ${quote(input.directory)} && ` : ""}exec env TRELLIS_URL=${quote(url)} TRELLIS_ACTOR=${quote(actor)} ${command}`,
	};
};
