import { type AgentRun, STATISTICS_WINDOW, type Statistics } from "@trellis/api";
import { openFlowRuns, stuckReviewMessages } from "../../db/queries/statisticsFaults.ts";
import { loopBill, loopTotals } from "../../db/queries/statisticsLoop.ts";
import type { Tx } from "../../db/tx.ts";
import * as agentRuns from "../agentRuns.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { deadRuns, faults } from "./faults.ts";

// How many pull requests the named bill of block two holds.
const BILL_ROWS = 5;

// The state of an agent run comes from the execution service, not from the
// database, so the open assignments are read before the transaction opens.
export const prepare = async (ctx: IoCtx & PrepareCtx) => deadRuns(await agentRuns.prepareOpenAgentRuns(ctx));

// The four statements run one after the other. One transaction holds one
// connection, so two statements on it never run at the same time.
export const get = async (_ctx: IoCtx, tx: Tx, runs: readonly AgentRun[]): Promise<Statistics> => {
	const messages = await stuckReviewMessages(tx);
	const flowRuns = await openFlowRuns(tx);
	const totals = await loopTotals(tx, STATISTICS_WINDOW);
	const bill = await loopBill(tx, STATISTICS_WINDOW, BILL_ROWS);
	return { faults: faults(runs, messages, flowRuns), loop: { ...totals, bill } };
};
