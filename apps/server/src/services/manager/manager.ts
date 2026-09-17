import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { IoCtx } from "../support.ts";
import { dispatchColumns } from "./dispatchColumns.ts";

export async function manage(ctx: IoCtx, input: { sessions: RuntimeProcessStatus[] }) {
	await dispatchColumns(ctx, input.sessions);
}
