import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { IoCtx } from "../support.ts";
import { dispatchCopilots } from "./dispatchCopilots.ts";

export async function manage(ctx: IoCtx, input: { sessions: RuntimeProcessStatus[] }) {
	await dispatchCopilots(ctx, input.sessions);
}
