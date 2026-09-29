import type { FlowExecutionRecord } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { recordsById } from "./queries.ts";

export const getMany = async (_ctx: ServiceCtx, tx: Tx, ids: string[]): Promise<FlowExecutionRecord[]> => {
	const byId = await recordsById(tx, ids);
	return ids.flatMap((id) => {
		const record = byId.get(id);
		return record === undefined ? [] : [record];
	});
};
