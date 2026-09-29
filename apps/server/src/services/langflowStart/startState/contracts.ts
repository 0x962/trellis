import type { AdmissionReceiptV1, CorrelationReceiptV1, DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { StartExecution } from "../store";

type ExecutionKey = { executionId: string };
export type StartRepository = {
	read(input: ExecutionKey): Promise<StartExecution>;
	markUnknown(input: ExecutionKey): Promise<StartExecution>;
	bind(
		input: ExecutionKey & { correlation: CorrelationReceiptV1; authority: DeliveryAuthorityV1 },
	): Promise<StartExecution>;
	open(input: ExecutionKey & { now: Date }): Promise<StartExecution>;
	confirm(input: ExecutionKey & { receipt: AdmissionReceiptV1 }): Promise<void>;
};
export type StartStateOperations = {
	read: { input: ExecutionKey; output: StartExecution };
	markUnknown: { input: ExecutionKey; output: StartExecution };
	bind: { input: Parameters<StartRepository["bind"]>[0]; output: StartExecution };
	bindCancellation: { input: Parameters<StartRepository["bind"]>[0]; output: StartExecution };
	restoreInitial: { input: ExecutionKey & { initialRecordBytes: string }; output: StartExecution };
	open: { input: ExecutionKey; output: StartExecution };
	confirm: { input: Parameters<StartRepository["confirm"]>[0]; output: null };
	pending: { input: { afterId: string }; output: string[] };
	cancellationProof: { input: ExecutionKey; output: string | null };
	admissionBytes: { input: ExecutionKey; output: { payloadBytes: string; confirmed: boolean } | null };
};
export type StartStateInput = {
	[K in keyof StartStateOperations]: { operation: K; input: StartStateOperations[K]["input"]; hostId: string };
}[keyof StartStateOperations];
export type StartStateResult = StartStateOperations[keyof StartStateOperations]["output"];
export type StartStateCall = (input: StartStateInput) => Promise<StartStateResult>;
