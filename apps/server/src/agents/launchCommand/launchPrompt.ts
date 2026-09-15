import type { AgentRun } from "@trellis/api";
import { nativeInstructions } from "./nativeInstructions.ts";

export const launchPrompt = (input: {
	run: Omit<AgentRun, "state">;
	url: string;
	context: string;
	messageId?: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	const prompt = `${prefix}${run.instruction}\n\n# Assignment\n\nYour name is ${run.name}. Your Trellis actor is ${actor}.\nTrellis URL: ${url}\nPersona: ${run.personaName} (${run.kind})\n\n${context}\n\nUse TRELLIS_URL and TRELLIS_ACTOR for every Trellis command. Read the repository's AGENTS.md before work.\n${nativeInstructions}`;
	return prompt;
};
