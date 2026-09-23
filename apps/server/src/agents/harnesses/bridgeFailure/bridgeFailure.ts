import type { HarnessEvent } from "../types.ts";

// The reason a bridge stopped, in the words a person reads on the session
// page. A thrown value is almost always an Error. The `ws` package throws an
// ErrorEvent, and `String` turns that value into the text "[object
// ErrorEvent]", which names no reason at all.
export function failureReason(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string")
		return error.message;
	return String(error);
}

// The last step of a bridge process that stopped. The reason reaches the
// runtime as an error event, and the session page reads it from there.
// Without this event the page shows only the exit code of the process.
//
// `pendingWrites` is the promise chain that sends harness events to the
// runtime. A rejected write in that chain is what stops a bridge, so
// `pendingWrites` has often rejected already. This function catches that
// rejection. An await on a rejected promise throws, and then the error event
// below never runs. A bridge can also stop for another reason while a write
// rejects, so a rejection with other words than `error` reaches the standard
// error stream.
//
// The caller sets the exit code after this function. A runtime that refuses
// the error event must not stop that. The reason then also goes to the
// standard error stream, which the runtime keeps with the session.
export async function recordBridgeFailure(options: {
	error: unknown;
	pendingWrites: Promise<unknown>;
	observe: (event: HarnessEvent) => Promise<unknown>;
}): Promise<void> {
	const print = (text: string) => void process.stderr.write(text);
	const reason = failureReason(options.error);
	await options.pendingWrites.catch((failure: unknown) => {
		const dropped = failureReason(failure);
		if (dropped !== reason) print(`An earlier event write failed: ${dropped}\n`);
	});
	print(`The bridge stopped: ${reason}\n`);
	await options.observe({ kind: "error", outcome: "failed", error: reason }).catch((failure: unknown) => {
		print(`The bridge could not record that reason: ${failureReason(failure)}\n`);
	});
}

// The reader of a failure in a bridge. Only one reader takes the rejection of
// `observationFailed`, so a second failure, or a failure after the race of the
// bridge ends, reaches nobody. `closeReports` marks that end, and each failure
// after it writes its reason to the standard error stream.
export function failureReporter(): {
	observationFailed: Promise<never>;
	reportFailure: (error: unknown) => void;
	closeReports: () => void;
} {
	let reject!: (error: unknown) => void;
	const observationFailed = new Promise<never>((_, rejectFailure) => {
		reject = rejectFailure;
	});
	let raceOpen = true;
	return {
		observationFailed,
		reportFailure: (error: unknown) => {
			if (raceOpen) {
				raceOpen = false;
				reject(error);
				return;
			}
			process.stderr.write(`The bridge also failed: ${failureReason(error)}\n`);
		},
		closeReports: () => {
			raceOpen = false;
		},
	};
}
