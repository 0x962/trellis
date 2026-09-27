// DbTiming holds request totals in milliseconds. `queueMs` counts the wait in the worker queue.
// `lockMs` sums each transaction's wait for the database lock. `ms` sums the time
// each transaction holds that lock, through commit or rollback. These totals
// include transactions in `prepare` and `afterCommit`. External calls outside
// transactions contribute only to the total request duration.
export type DbTiming = { ms: number; lockMs: number; queueMs: number };

export const createDbTiming = (): DbTiming => ({ ms: 0, lockMs: 0, queueMs: 0 });

export const addTiming = (into: DbTiming, from: DbTiming) => {
	into.ms += from.ms;
	into.lockMs += from.lockMs;
	into.queueMs += from.queueMs;
};

// The Server-Timing header value a client reads the three parts from. A
// streaming batch sends its headers before its calls finish, so its header
// counts only the calls that finished by then.
export const serverTimingHeader = (timing: DbTiming) =>
	`db;dur=${timing.ms.toFixed(2)}, lock;dur=${timing.lockMs.toFixed(2)}, queue;dur=${timing.queueMs.toFixed(2)}`;

// A transaction that holds the database lock this long makes every other
// call wait, so the server logs it with the service name.
export const LONG_TRANSACTION_MS = 250;
