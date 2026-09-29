import type { FlowDocumentSnapshotV1, FlowExecutionRecord, FlowExecutionViewV1, FlowPublicationV1 } from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import type {
	AdmissionReceiptV1,
	AdmissionStateV1,
	CorrelationReceiptV1,
	DeliveryAuthorityV1,
	SubmissionV1,
} from "../../langflowContracts";

export type StartIdentity = { actorKind: "human" | "agent"; actorName: string; requestId: string };
export type StartExecution = {
	engine: "langflow";
	executionId: string;
	flowId: string;
	ticketId: string;
	projectId: string;
	diffId: string | null;
	reviewedHead: string | null;
	repeatOf: string | null;
	repeatReason: string | null;
	publicationId: string;
	publication: FlowPublicationV1;
	snapshot: FlowDocumentSnapshotV1;
	hostId: string;
	requestBytes: string;
	submissionBytes: string;
	submission: SubmissionV1;
	correlation: CorrelationReceiptV1 | null;
	admission: AdmissionStateV1;
	authority: DeliveryAuthorityV1 | null;
	createdAt: Date;
	canceled: boolean;
};
export type LegacyStartExecution = { engine: "legacy"; executionId: string; record: FlowExecutionRecord };
export type StartRun = StartExecution | LegacyStartExecution;
export type StartReceipt = StartIdentity & { requestBytes: string; executionId: string };
export type StartStore = {
	readRequest: (tx: Tx, input: StartIdentity) => Promise<StartReceipt | null>;
	saveRequest: (tx: Tx, input: StartReceipt) => Promise<StartReceipt>;
	read: (tx: Tx, input: { executionId: string }) => Promise<StartRun>;
	readSubmission: (tx: Tx, input: { executionId: string }) => Promise<StartExecution>;
	latest: (
		tx: Tx,
		input: { flowId: string; diffId: string },
	) => Promise<{
		execution: StartRun;
		status: FlowExecutionViewV1["status"] | null;
		failureKind: FlowExecutionViewV1["failureKind"];
	} | null>;
	reserve: (tx: Tx, input: StartExecution & StartIdentity) => Promise<StartExecution>;
	markUnknown: (tx: Tx, input: { executionId: string }) => Promise<StartExecution>;
	bind: (
		tx: Tx,
		input: { executionId: string; correlation: CorrelationReceiptV1; authority: DeliveryAuthorityV1 },
	) => Promise<StartExecution>;
	openAdmission: (tx: Tx, input: { executionId: string; now: Date }) => Promise<StartExecution>;
	confirmAdmission: (tx: Tx, input: { executionId: string; receipt: AdmissionReceiptV1 }) => Promise<void>;
};
