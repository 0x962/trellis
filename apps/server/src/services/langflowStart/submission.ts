import type { FlowDocumentSnapshotV1, FlowPublicationV1 } from "@trellis/api";
import { protocolDigest, type SubmissionV1 } from "../../langflowContracts";

export function submission(input: {
	executionId: string;
	hostId: string;
	actor: SubmissionV1["actor"];
	requestId: string;
	requestBytes: string;
	publication: FlowPublicationV1;
	snapshot: FlowDocumentSnapshotV1;
}) {
	const payloadBytes = JSON.stringify({ publication: input.publication, snapshot: input.snapshot });
	const value: SubmissionV1 = {
		version: 1,
		hostId: input.hostId,
		executionId: input.executionId,
		publicationId: input.publication.publicationId,
		actor: input.actor,
		requestId: input.requestId,
		requestDigest: protocolDigest(input.requestBytes),
		submissionDigest: protocolDigest(payloadBytes),
		state: "reserved",
		correlation: null,
		admission: { state: "closed", barrierId: input.executionId },
		revision: 1,
	};
	return { submission: value, submissionBytes: payloadBytes };
}
