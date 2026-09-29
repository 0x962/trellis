import type { FlowListInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { list } from "../../flows/flows.ts";
import { readSummaries } from "./readSummaries.ts";
import { summarize } from "./summarize.ts";
import type { DiscoveryAvailability, DiscoveryResult } from "./types.ts";

export const discovery = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: FlowListInput,
	availability: DiscoveryAvailability,
): Promise<DiscoveryResult> => {
	const flows = await list(ctx, tx, input);
	const facts = new Map(
		(
			await readSummaries(
				tx,
				flows.map((flow) => flow.id),
			)
		).map((row) => [row.flowId, row]),
	);
	return {
		engine: availability,
		entries: flows.map((flow) => summarize(flow, facts.get(flow.id)!, availability, ctx.actor !== null)),
	};
};
