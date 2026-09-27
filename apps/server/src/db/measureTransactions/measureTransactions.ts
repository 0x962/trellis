import type { JobsLog } from "../../jobs.ts";
import type { DbTiming } from "../../serverTiming.ts";
import type { Db } from "../client.ts";

type Options = {
	name: string;
	log: JobsLog;
	longTransactionMs: number;
	timing?: DbTiming;
};

const roundMs = (ms: number) => Math.round(ms * 10) / 10;

export const measureTransactions = (db: Pick<Db, "transaction">, options: Options): Db["transaction"] => {
	const transaction: Db["transaction"] = async (fn, config) => {
		const opened = performance.now();
		let locked: number | undefined;
		try {
			return await db.transaction((tx) => {
				locked = performance.now();
				return fn(tx);
			}, config);
		} finally {
			const ended = performance.now();
			const lockMs = (locked ?? ended) - opened;
			const heldMs = locked === undefined ? 0 : ended - locked;
			if (options.timing !== undefined) {
				options.timing.lockMs += lockMs;
				options.timing.ms += heldMs;
			}
			if (heldMs >= options.longTransactionMs) {
				options.log("long transaction", { service: options.name, heldMs: roundMs(heldMs), lockMs: roundMs(lockMs) });
			}
		}
	};
	return transaction;
};
