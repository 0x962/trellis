import { invalidInput } from "../../errors.ts";

export type SendTarget = { expectedTerminalId?: string | null; expectedSessionId?: string | null };

export const assertSendTarget = (run: { terminalId: string | null; sessionId: string | null }, input: SendTarget) => {
	if (
		(input.expectedTerminalId !== undefined && input.expectedTerminalId !== run.terminalId) ||
		(input.expectedSessionId !== undefined && input.expectedSessionId !== run.sessionId)
	)
		throw invalidInput(
			"id",
			"The agent session changed after this delivery was queued. Inspect the current session before a resend.",
		);
};
