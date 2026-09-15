import type { AgentRunStartInput } from "@trellis/api";

export const restartManager = async <T>(
	client: {
		stop: (input: { id: string }) => Promise<unknown>;
		start: (input: AgentRunStartInput) => Promise<T>;
	},
	input: { id: string; project: string; personaId: string },
) => {
	await client.stop({ id: input.id });
	return client.start({ project: input.project, personaId: input.personaId, newSession: true });
};
