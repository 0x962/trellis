import type { readProjectionFacts } from "../../db/queries/langflowExecution";
import type { ClassificationReceipt } from "../../db/queries/langflowExecution/classification.ts";

type StoredFacts = Awaited<ReturnType<typeof readProjectionFacts>>;
export type NativeProjectionFact = StoredFacts["native"][number];
export type ProjectionFacts = Omit<StoredFacts, "humanDeliveries"> & {
	classification: ClassificationReceipt | null;
	human: StoredFacts["humanDeliveries"];
};
