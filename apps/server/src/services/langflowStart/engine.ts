import type { FlowDocumentSnapshotV1, FlowPublicationV1 } from "@trellis/api";
import type {
	AdmissionReceiptV1,
	CorrelationKeyV1,
	CorrelationLookupResultV1,
	CorrelationReceiptV1,
	DeliveryAuthorityV1,
} from "../../langflowContracts";

export type EngineSubmission = {
	envelopeBytes: string;
	payloadBytes: string;
	publication: FlowPublicationV1;
	snapshot: FlowDocumentSnapshotV1;
};
export type LangflowStartEngine = {
	lookup: (key: CorrelationKeyV1) => Promise<CorrelationLookupResultV1>;
	submit: (
		input: EngineSubmission,
	) => Promise<{ state: "found"; receipt: CorrelationReceiptV1 } | { state: "unknown"; key: CorrelationKeyV1 }>;
	admit: (input: {
		receipt: AdmissionReceiptV1;
		authority: DeliveryAuthorityV1;
		authorityBytes: string;
	}) => Promise<{ state: "admitted"; receipt: AdmissionReceiptV1 } | { state: "pending" | "unknown" }>;
};
