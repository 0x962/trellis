import type { JobsLog } from "../../jobs.ts";
import type { DbTiming } from "../../serverTiming.ts";
import type { Db } from "../client.ts";

type Options = {
	name: string;
	reqId: string;
	log: JobsLog;
	longTransactionMs: number;
	timing?: DbTiming;
};

const roundMs = (ms: number) => Math.round(ms * 10) / 10;

export const createMeasuredTransaction = (db: Pick<Db, "transaction">, options: Options): Db["transaction"] => {
	const transaction: Db["transaction"] = async (fn, config) => {
		const requestedAt = performance.now();
		let acquiredAt: number | undefined;
		try {
			return await db.transaction((tx) => {
				acquiredAt = performance.now();
				return fn(tx);
			}, config);
		} finally {
			const completedAt = performance.now();
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
