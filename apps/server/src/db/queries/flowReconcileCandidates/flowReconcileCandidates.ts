import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { query } from "./query.ts";

export const flowReconcileCandidates = (tx: Tx) => rows<{ id: string }>(tx, query);
