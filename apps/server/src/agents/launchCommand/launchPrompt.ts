import type { AgentRun } from "@trellis/api";

export const launchPrompt = (input: {
	run: Omit<AgentRun, "state" | "processStatus" | "observation">;
	url: string;
	context: string;
	messageId?: string;
}) => {
	const { run, url, context } = input;
	const actor = `agent:${run.id}`;
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	// A session agent receives the prompt the person typed, and nothing else.
	if (run.kind === "session") return `${prefix}${run.instruction}`;
	if (run.kind === "manager")
		return `${prefix}${JSON.stringify({
			agent: { id: run.id, name: run.personaName },
			actor,
			trellisUrl: url,
			persona: { id: run.personaId, name: run.personaName },
			context,
		})}`;
	const prompt = `${prefix}${run.instruction}\n\n# Assignment\n\nYour persona is ${run.personaName}. Your Trellis actor is ${actor}.\nTrellis URL: ${url}\nPersona: ${run.personaName} (${run.kind})\n\n${context}`;
	return prompt;
};
