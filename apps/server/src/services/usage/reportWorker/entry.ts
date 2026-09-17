import { computeUsageReport } from "../aggregate.ts";
import { collectUsageEntries } from "../entries.ts";
import type { UsageReportWorkerInput, UsageReportWorkerOutput } from "./protocol.ts";

declare const self: Worker;

const send = (message: UsageReportWorkerOutput) => self.postMessage(message);

self.onmessage = ({ data }: MessageEvent<UsageReportWorkerInput>) => {
	void collectUsageEntries(data.roots, data.days, data.cutoffMs)
		.then((collected) => computeUsageReport({ ...data, ...collected }))
		.then((report) => send({ type: "result", report }))
		.catch((error: Error) =>
			send({
				type: "error",
				error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
			}),
		);
};
