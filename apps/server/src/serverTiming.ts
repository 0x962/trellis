// The time one HTTP request spent on the database, in milliseconds, in three
// parts. `queueMs` is the wait in the queue of the database worker, which
// runs one call at a time. `lockMs` is the wait for the database lock after
// the call left the queue: the database has one lock, and a call that runs
// beside the queue or a background job can hold it. `ms` is the time from
// the moment the transaction got the lock to the end of its after-commit
// work. A `prepare` step runs gh before the transaction and counts in none
// of the three. A batch reports the sum of its calls.
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
