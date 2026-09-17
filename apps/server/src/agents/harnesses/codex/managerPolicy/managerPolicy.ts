import { z } from "zod";

export const managerPolicy = {
	config: {},
	terminalRequest(
		message: unknown,
		input: { threadId: string; systemPrompt: string; config: Record<string, unknown> },
	) {
		const value = z
			.looseObject({ method: z.string().optional(), params: z.record(z.string(), z.unknown()).optional() })
			.parse(message);
		const params = value.params ?? {};
		if (value.method === "turn/start") value.params = { ...params, ...managerPolicy.turn, threadId: input.threadId };
		if (value.method === "thread/resume")
			value.params = {
				...params,
				threadId: input.threadId,
				baseInstructions: input.systemPrompt,
				developerInstructions: "",
				config: input.config,
				approvalPolicy: "never",
				sandbox: "danger-full-access",
			};
		return value;
	},
	turn: { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } },
};
