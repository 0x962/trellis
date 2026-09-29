import type { LangflowSidecarManifestV1 } from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { LiveOwnership } from "../../contracts";
import type { DispatchBlock, ReconciliationReceipt } from "../../dispatchGate";

export type HostReconciliationInput = {
	operation: "prepare" | "commit";
	block: DispatchBlock;
	bootId: string;
	manifest: LangflowSidecarManifestV1;
	enginePackageDigest: string;
	engineConfigSha256: string;
	observation: LiveOwnership;
	openedDatabaseReceiptId: string | null;
	receiptId: string | null;
};

export type HostReconciliationResult =
	| { state: "prepared" | "committed"; receipt: ReconciliationReceipt }
	| { state: "blocked"; reason: string };
