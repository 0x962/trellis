import type { UsageReport } from "@trellis/api";
import type { UsageReportInputs } from "../aggregate.ts";
import type { UsageRoot } from "../roots.ts";

export type UsageReportWorkerInput = Omit<UsageReportInputs, "entries" | "sessionLabels" | "scannedFiles"> & {
	roots: readonly UsageRoot[];
};

type SerializedError = { name: string; message: string; stack?: string };

export type UsageReportWorkerOutput =
	| { type: "result"; report: UsageReport }
	| { type: "error"; error: SerializedError };
