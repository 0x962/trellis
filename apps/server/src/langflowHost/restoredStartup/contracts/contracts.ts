import type { LoadQualifiedPackageInput } from "../../../../../../integrations/langflow/release";
import type { HomeLock } from "../../../homeLock";
import type { RestoredEngineInput } from "../../restoredEngine";

export type RestoredEngineStartup = {
	input: RestoredEngineInput;
	receiptId: string;
	homeLock: HomeLock;
	signal: AbortSignal;
};
export type ReadRestoredEngineStartupInput = {
	home: string;
	receiptId: string | null;
	qualification: LoadQualifiedPackageInput;
	homeLock: HomeLock;
	signal: AbortSignal;
};
