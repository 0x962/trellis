import type { Tx } from "../../db/tx.ts";
import type { EvidenceCtx } from "./types.ts";

export const result = async (_ctx: EvidenceCtx, _tx: Tx, input: unknown) => input;
