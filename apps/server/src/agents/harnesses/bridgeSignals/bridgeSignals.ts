import { failureReason } from "../bridgeFailure/index.ts";
import type { HarnessEvent } from "../types.ts";

// A bridge receives a stop signal and writes one line, because nothing else tells
// a person why the session ended. Each listener runs one time: a second press
// of Ctrl+C finds none, and Node stops the bridge. The Muse bridge needs that
// first press, because its failure path ends the raw mode of the terminal, and
// the terminal then sends SIGINT while the bridge still records the reason.
//
// `stopNormally` resolves the same promise for a bridge that ends its own run,
// and `receivedSignal` stays null in that case.
export function listenForStopSignals(): {
	terminated: Promise<void>;
	receivedSignal: () => NodeJS.Signals | null;
	stopNormally: () => void;
} {
	let received: NodeJS.Signals | null = null;
	let stopNormally!: () => void;
	const terminated = new Promise<void>((resolve) => {
		stopNormally = resolve;
		const stopOn = (signal: NodeJS.Signals, text: string) =>
			process.once(signal, () => {
				received = signal;
				process.stderr.write(`${text}\n`);
				resolve();
			});
		stopOn("SIGTERM", "The bridge received SIGTERM.");
		stopOn("SIGHUP", "The bridge received SIGHUP.");
		stopOn("SIGINT", "The bridge received Ctrl+C.");
	});
	return { terminated, receivedSignal: () => received, stopNormally };
}

// The last step of a bridge that a signal stopped. Without this event the
// session page reads the run as one that finished its work.
//
// A write that rejected before the signal holds the reason the run really
// ended, so that reason goes to the runtime in place of the interruption.
// Answers the reason it recorded, or null for an interruption.
export async function recordBridgeStop(options: {
	pendingWrites: Promise<unknown>;
	observe: (event: HarnessEvent) => Promise<unknown>;
}): Promise<string | null> {
	const lost = await options.pendingWrites.then(
		() => null,
		(failure: unknown) => failureReason(failure),
	);
	const event: HarnessEvent =
		lost === null ? { kind: "idle", outcome: "interrupted" } : { kind: "error", outcome: "failed", error: lost };
	await options.observe(event).catch((failure: unknown) => {
		process.stderr.write(`The bridge could not record the stop: ${failureReason(failure)}\n`);
	});
	return lost;
}
