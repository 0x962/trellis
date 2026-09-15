import type { AgentRun } from "@trellis/api";
import { managerInstructions } from "./managerInstructions.ts";
import { nativeInstructions } from "./nativeInstructions.ts";

export const launchPrompt = (input: {
	run: Omit<AgentRun, "state" | "processStatus">;
	url: string;
	context: string;
	messageId?: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	const instructions =
		run.kind === "manager"
			? managerInstructions
			: `Use TRELLIS_URL and TRELLIS_ACTOR for every Trellis command. Read the repository's AGENTS.md before work.\n${nativeInstructions}`;
	const prompt = `${prefix}${run.instruction}\n\n# Assignment\n\nYour name is ${run.name}. Your Trellis actor is ${actor}.\nTrellis URL: ${url}\nPersona: ${run.personaName} (${run.kind})\n\n${context}\n\n${instructions}`;
	return prompt;
};
