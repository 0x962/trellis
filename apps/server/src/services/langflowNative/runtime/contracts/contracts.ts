import type { ServiceCtx } from "../../../../context";
import type { Tx } from "../../../../db/tx";
import type { CompletionReceiptV1, DeliveryAuthorityV1, NativeHandleV1 } from "../../../../langflowContracts";
import type { createEngineClient } from "../../../../langflowHost/engineClient";
import type { IoCtx } from "../../../support";
import type { observeNativeAttempt } from "../../observeNativeAttempt";
import type { recoverNativeAttempt } from "../../recoverNativeAttempt";

export type ExecutionKey = { executionId: string };
export type NativeKey = ExecutionKey & { stepId: string };
export type HostKey = { hostId: string };
export type NativeRuntimeRow = NativeKey & {
	handle: NativeHandleV1;
	requestBytes: string;
	authority: DeliveryAuthorityV1 | null;
	canceled: boolean;
	admissionOpen: boolean;
	observe: boolean;
	completionId: string | null;
};
export type NativeDelivery = {
	requestBytes: string;
	resultBytes: string;
	deliveryBytes: string;
	authority: DeliveryAuthorityV1;
	handle: NativeHandleV1;
};
export type RuntimeStateOperations = {
	pending: { input: { afterId: string }; output: string[] };
	steps: { input: ExecutionKey & { afterStepId: string }; output: NativeRuntimeRow[] };
	delivery: { input: NativeKey; output: NativeDelivery | null };
	receipt: { input: ExecutionKey & { completionId: string }; output: CompletionReceiptV1 | null };
};
export type RuntimeStateInput = {
	[K in keyof RuntimeStateOperations]: HostKey & { operation: K; input: RuntimeStateOperations[K]["input"] };
}[keyof RuntimeStateOperations];
export type RuntimeAcknowledgeInput = HostKey & NativeKey & {
	requestBytes: string;
	waitBytes: string;
	receipt: CompletionReceiptV1;
};
export type RuntimeWorkerDependencies = {
	recordWorkspace: (
		ctx: ServiceCtx,
		tx: Tx,
		input: Parameters<Parameters<typeof observeNativeAttempt>[0]["recordWorkspace"]>[1],
	) => Promise<void>;
	dispatchGate: (ctx: IoCtx) => Promise<Parameters<typeof recoverNativeAttempt>[0]["dispatchGate"]>;
};
export type NativeRuntimePort = {
	state<K extends keyof RuntimeStateOperations>(
		operation: K,
		input: RuntimeStateOperations[K]["input"],
	): Promise<RuntimeStateOperations[K]["output"]>;
	observe(input: NativeKey): Promise<void>;
	recover(input: NativeKey): Promise<void>;
	acknowledge(input: Omit<RuntimeAcknowledgeInput, "hostId">): Promise<void>;
};
export type NativeEngineClient = ReturnType<typeof createEngineClient>;
