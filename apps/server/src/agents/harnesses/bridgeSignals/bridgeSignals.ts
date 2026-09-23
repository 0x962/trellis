// A bridge takes a stop signal and writes one line, because nothing else tells
// a person why the session ended. Each listener runs one time: a second press
// of Ctrl+C finds none, and Node stops the bridge. The Muse bridge needs that
// first press, because its failure path ends the raw mode of the terminal, and
// Ctrl+C then makes SIGINT while the bridge still records the reason.
//
// `stopNormally` resolves the same promise for a bridge that ends its own run,
// and `stopSignal` stays null in that case.
export function listenForStopSignals(): {
	terminated: Promise<void>;
	stopSignal: () => NodeJS.Signals | null;
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
	return { terminated, stopSignal: () => received, stopNormally };
}
