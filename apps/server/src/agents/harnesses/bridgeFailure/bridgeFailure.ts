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

// The last step of a bridge process that stopped for a reason. The reason
// reaches the runtime as an error event, and the session page reads it from
// there. Without this event the session page shows the exit code of the
// bridge process and nothing else.
//
// A bridge sends each harness event to the runtime through a chain of
// promises, and one rejected write in that chain is what stops the bridge.
// `queued` is that chain, so `queued` has often rejected already. This
// function drops that rejection, because an await on a rejected promise
// throws out of the catch block of the caller, and the error event below
// never reaches the runtime. The reason the bridge stopped is `error`.
//
// This function throws nothing. The caller sets the exit code of the process
// after it, and a runtime that refuses the error event must not stop that.
// The reason then goes to the standard error stream of the bridge, which the
// runtime keeps with the session.
export async function recordBridgeFailure(options: {
	error: unknown;
	queued: Promise<unknown>;
	observe: (event: HarnessEvent) => Promise<unknown>;
	print?: (text: string) => void;
}): Promise<void> {
	const print = options.print ?? ((text: string) => void process.stderr.write(text));
	const reason = failureReason(options.error);
	await options.queued.catch(() => {});
	print(`The bridge stopped: ${reason}\n`);
	await options.observe({ kind: "error", outcome: "failed", error: reason }).catch((failure: unknown) => {
		print(`The bridge could not record that reason: ${failureReason(failure)}\n`);
	});
}
