import type { FlowDiscoveryV1, FlowListInput } from "@trellis/api";
import type { Tx } from "../../../db/tx";
import { LangflowHostControl } from "../../../langflowHost";
import { discovery as readDiscovery } from "../../flowDocuments";
import type { IoCtx } from "../../support";

export async function discovery(ctx: IoCtx, tx: Tx, input: FlowListInput): Promise<FlowDiscoveryV1> {
	const recovery = LangflowHostControl.recovery(ctx.home);
	return readDiscovery(
		ctx.core,
		tx,
		input,
		recovery.state === "open"
			? { state: "unknown", observedAt: null, reason: "The engine has no current driver observation." }
			: {
					state: "unavailable",
					observedAt: ctx.now().toISOString(),
					reason:
						recovery.state === "blocked"
							? "The host blocks dispatch until recovery completes."
							: "The host control is not initialized.",
				},
	);
}
