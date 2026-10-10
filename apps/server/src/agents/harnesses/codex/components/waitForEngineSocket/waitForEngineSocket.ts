import { watch } from "node:fs";
import { nativeObservationTimeoutMs } from "../../../../nativeObservationTimeout/index.ts";

type Dependencies = {
	watch: (directory: string, changed: (name: string | null) => void) => { close: () => void };
	schedule: (expired: () => void, delayMs: number) => () => void;
};

const defaults: Dependencies = {
	watch: (directory, changed) => watch(directory, (_, name) => changed(name)),
	schedule: (expired, delayMs) => {
		const timer = setTimeout(expired, delayMs);
		return () => clearTimeout(timer);
	},
};

export function waitForEngineSocket(directory: string, dependencies: Dependencies = defaults) {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const ready = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	let closed = false;
	const watcher = dependencies.watch(directory, (name) => {
		if (closed || name !== "engine.sock") return;
		close();
		resolve();
	});
	const cancelDeadline = dependencies.schedule(() => {
		close();
		reject(new Error(`Codex app-server socket did not appear within ${nativeObservationTimeoutMs / 1000} seconds`));
	}, nativeObservationTimeoutMs);
	function close() {
		if (closed) return;
		closed = true;
		watcher.close();
		cancelDeadline();
	}
	return { ready, close };
}
