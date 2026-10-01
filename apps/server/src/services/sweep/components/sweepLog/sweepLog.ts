import type { JobsLog } from "../../../../jobs";

export function sweepLog(log: JobsLog) {
	const sweepId = crypto.randomUUID();
	const write: JobsLog = (message, fields) => log(message, { ...fields, sweepId });
	return {
		write,
		phase: (phase: string) => {
			const started = performance.now();
			write("sweep phase started", { phase });
			return (fields: Record<string, unknown> = {}) =>
				write("sweep phase completed", { ...fields, phase, elapsedMs: performance.now() - started });
		},
	};
}
