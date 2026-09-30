import { mergeTickets as candidates } from "../../../db/queries/mergeTickets/index.ts";
import type { Tx } from "../../../db/tx.ts";
import type { ServiceCtx } from "../../support.ts";
import { parseRef } from "../queries.ts";

export const mergeTickets = (_ctx: ServiceCtx, tx: Tx, input: { pr: string }) =>
	candidates(tx, { ref: parseRef(input.pr), state: "open" });
