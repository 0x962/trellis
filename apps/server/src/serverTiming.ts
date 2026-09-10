// The database time of one HTTP request, in milliseconds. Each service call
// of the request adds the time from the start of its transaction to the end
// of its after-commit work, so a batch reports the sum of its calls. A call
// that waits in the worker queue adds none of the wait.
export type DbTiming = { ms: number };

export const createDbTiming = (): DbTiming => ({ ms: 0 });

// The Server-Timing header value a client reads the database time from.
export const serverTimingHeader = (timing: DbTiming) => `db;dur=${timing.ms.toFixed(2)}`;
