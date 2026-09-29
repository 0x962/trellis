import type { SubmissionV1 } from "../../langflowContracts";
import type { StartExecution } from "./store.ts";

export function submissionEnvelope(execution: StartExecution): string {
	const original: SubmissionV1 = {
		version: 1,
		hostId: execution.hostId,
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		actor: { kind: execution.submission.actor.kind, name: execution.submission.actor.name },
		requestId: execution.submission.requestId,
		requestDigest: execution.submission.requestDigest,
		submissionDigest: execution.submission.submissionDigest,
		state: "reserved",
		correlation: null,
		admission: { state: "closed", barrierId: execution.executionId },
		revision: 1,
	};
	return JSON.stringify(original);
}
