import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { getRun } from "../queries.ts";

export const target = async (tx: Tx, input: { runId: string }) => {
	const run = await getRun(tx, input.runId);
	if (run.runtime !== "native" || run.workspaceId === null || run.terminalId === null)
		throw invalidInput("runId", "This run has no recorded native workspace.");
	return { workspace: run.workspaceId };
};
