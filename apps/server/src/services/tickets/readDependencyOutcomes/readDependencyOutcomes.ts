import type { ServiceCtx } from "../../../context.ts";
import { chainRows } from "../../../db/queries/chainRows.ts";
import type { Tx } from "../../../db/tx.ts";

export const readDependencyOutcomes = async (_ctx: ServiceCtx, tx: Tx, input: { ticketId: string }) =>
	(await chainRows(tx, input.ticketId)).flatMap((item) =>
		item.outcome === "" ? [] : [{ identifier: item.identifier, outcome: item.outcome }],
	);
