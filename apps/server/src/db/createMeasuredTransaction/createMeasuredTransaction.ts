import type { JobsLog } from "../../jobs.ts";
import type { DbTiming } from "../../serverTiming.ts";
import type { Db } from "../client.ts";
import type { OperationDiagnostics } from "../operationDiagnostics";

type Options = {
	name: string;
	reqId: string;
	log: JobsLog;
	longTransactionMs: number;
	timing?: DbTiming;
	diagnostics?: OperationDiagnostics;
};

const roundMs = (ms: number) => Math.round(ms * 10) / 10;

export const createMeasuredTransaction = (db: Pick<Db, "transaction">, options: Options): Db["transaction"] => {
	const transaction: Db["transaction"] = async (fn, config) => {
		const requestedAt = performance.now();
		let acquiredAt: number | undefined;
		const identity = { name: options.name, reqId: options.reqId };
		const finishWait = options.diagnostics?.begin({ ...identity, phase: "transaction.wait" });
		let finishTransaction: ReturnType<OperationDiagnostics["begin"]> | undefined;
		let outcome: "success" | "failure" = "failure";
		try {
			const result = await db.transaction((tx) => {
				acquiredAt = performance.now();
				finishWait?.("success");
				finishTransaction = options.diagnostics?.begin({ ...identity, phase: "transaction" });
				return fn(tx);
			}, config);
			outcome = "success";
			return result;
		} finally {
			const completedAt = performance.now();
			if (acquiredAt === undefined) finishWait?.("failure");
			finishTransaction?.(outcome);
			const lockMs = (acquiredAt ?? completedAt) - requestedAt;
			const heldMs = acquiredAt === undefined ? 0 : completedAt - acquiredAt;
			if (options.timing !== undefined) {
				options.timing.lockMs += lockMs;
				options.timing.ms += heldMs;
			}
			if (heldMs >= options.longTransactionMs) {
				options.log("long transaction", {
					service: options.name,
					reqId: options.reqId,
					heldMs: roundMs(heldMs),
					lockMs: roundMs(lockMs),
				});
			}
		}
	};
	return transaction;
};
