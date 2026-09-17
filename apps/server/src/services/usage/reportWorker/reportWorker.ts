import type { UsageReport } from "@trellis/api";
import type { UsageReportWorkerInput, UsageReportWorkerOutput } from "./protocol.ts";

const workerError = (input: { name: string; message: string; stack?: string }) => {
	const error = new Error(input.message);
	error.name = input.name;
	if (input.stack) error.stack = input.stack;
	return error;
};

// The database worker starts this worker for transcript parsing and report
// aggregation. A large transcript scan cannot delay database calls.
export const computeUsageReportInWorker = (input: UsageReportWorkerInput): Promise<UsageReport> => {
	const worker = new Worker(new URL("./entry.ts", import.meta.url).href, { name: "trellis-usage-report" });
	const result = new Promise<UsageReport>((resolve, reject) => {
		worker.onmessage = ({ data }: MessageEvent<UsageReportWorkerOutput>) => {
			if (data.type === "result") resolve(data.report);
			else reject(workerError(data.error));
		};
		worker.onerror = (event) => reject(new Error(event.message));
		worker.postMessage(input);
	});
	return result.finally(() => worker.terminate());
};
