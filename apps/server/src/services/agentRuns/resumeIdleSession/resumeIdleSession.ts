import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { startNative } from "../nativeStart.ts";
import { prepareResume, type ResumeCtx } from "../resume.ts";

export async function resumeIdleSession(
	ctx: ResumeCtx,
	input: { id: string; terminalId: string; text: string; messageId: string },
	start: typeof startNative = startNative,
) {
	await nativeHost(ctx.home).waitFor(input.terminalId, (session) => session.status === "exited", {
		rejectAgentError: false,
	});
	return prepareResume(
		ctx,
		{
			id: input.id,
			expectedTerminalId: input.terminalId,
			requestId: `idle:${input.messageId}`,
			prompt: input.text,
			requireAssigned: true,
		},
		start,
	);
}
