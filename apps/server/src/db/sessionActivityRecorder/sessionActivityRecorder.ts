import { systemContext } from "../../context.ts";
import type { JobsLog } from "../../jobs.ts";
import { recordObservedActivity } from "../../services/agentRuns/activity.ts";
import type { Db } from "../client.ts";
import { createMeasuredTransaction } from "../createMeasuredTransaction";
import type { OperationDiagnostics } from "../operationDiagnostics";

export const createSessionActivityRecorder = (
	db: Pick<Db, "transaction">,
	log: JobsLog,
	diagnostics?: OperationDiagnostics,
) => {
	const transaction = createMeasuredTransaction(db, {
		name: "session.monitor",
		reqId: "session.monitor",
		log,
		longTransactionMs: Infinity,
		diagnostics,
	});
	return (input: Parameters<typeof recordObservedActivity>[2]) =>
		transaction((tx) => recordObservedActivity(systemContext(), tx, input));
};
