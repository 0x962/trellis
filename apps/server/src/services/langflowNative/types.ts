import type { Harness } from "@trellis/api";
import type { ServiceCtx } from "../../context";
import type { lockExecution } from "../../db/queries/langflowExecution/executions";
import type { Tx } from "../../db/tx";
import type { DeliveryAuthorityV1, NativeRequestV1 } from "../../langflowContracts";
import type { DispatchGate } from "../../langflowHost";
import type { NativePromptReceipt } from "./readPromptInputs";

export type NativeExecution = Awaited<ReturnType<typeof lockExecution>>;

// The publication resolver checks the engine checkpoint against the saved document.
// requestDigest covers the exact request bytes that resolver approved.
export type ApprovedNativeOccurrence = {
	engineNodeId: string;
	inputReceipts: NativePromptReceipt[];
	requestDigest: string;
	specHash: string;
	taskKey: string;
	name: string;
	instruction: string;
	harness: Harness;
	accountId?: string;
};

export type NativeReservationCtx = ServiceCtx & {
	home: string;
	dispatchGate: Pick<DispatchGate, "acquire">;
	// The private transport authenticates this grant before it calls the bridge.
	nativeAuthority: DeliveryAuthorityV1;
	resolveOccurrence: (
		tx: Tx,
		input: { execution: NativeExecution; request: NativeRequestV1; requestBytes: string },
	) => Promise<ApprovedNativeOccurrence>;
};
