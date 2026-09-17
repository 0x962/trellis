import type { AgentRun } from "@trellis/api";
import { nativeInstructions } from "./nativeInstructions.ts";

export const launchPrompt = (input: {
	run: Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation">;
	url: string;
	context: string;
	messageId?: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	if (run.kind === "session" && run.projectId === null) return `${prefix}${run.instruction}`;
	if (run.kind === "manager")
		return `${prefix}${JSON.stringify({
			agent: { id: run.id, name: run.name },
			actor,
			trellisUrl: url,
			context,
		})}`;
	const instructions = `Use TRELLIS_URL and TRELLIS_ACTOR for every Trellis command. Read the repository's AGENTS.md before work.\n${nativeInstructions}`;
	const prompt = `${prefix}${run.instruction}\n\n# Assignment\n\nYour Trellis actor is ${actor}.\nTrellis URL: ${url}\n\n${context}\n\n${instructions}`;
	return prompt;
};
