import type { IoCtx } from "../../support.ts";
import { startNative } from "../nativeStart.ts";
import { prepareResume } from "../resume.ts";

export const prepareSetModel = (
	ctx: IoCtx,
	input: { id: string; model: string; expectedTerminalId: string; requestId: string },
	start: typeof startNative = startNative,
) => prepareResume(ctx, input, start, true);
