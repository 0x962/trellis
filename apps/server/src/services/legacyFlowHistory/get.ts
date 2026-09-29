import type { FlowExecutionRecord } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { getMany } from "./getMany.ts";

export const get = async (ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<FlowExecutionRecord> => {
	const [record] = await getMany(ctx, tx, [input.id]);
	if (record === undefined) throw fail("NOT_FOUND", { kind: "flow execution", ref: input.id });
	return record;
};
