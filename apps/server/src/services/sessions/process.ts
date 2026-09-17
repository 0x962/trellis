import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx } from "../support.ts";

// The process of the attempt `terminalId`, or null when the run has no
// attempt or the runtime holds no record of it.
export const sessionProcess = async (
	ctx: Pick<ServiceCtx, "home">,
	terminalId: string | null,
): Promise<RuntimeProcessStatus | null> => {
	if (terminalId === null) return null;
	const host = nativeHost(ctx.home, process.env, await ensureNativeRuntime(ctx.home));
	try {
		return await host.status(terminalId);
	} catch (error) {
		if ((error as { code?: string }).code === "SESSION_NOT_FOUND") return null;
		throw error;
	}
};
