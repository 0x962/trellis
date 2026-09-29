import { isDeepStrictEqual } from "node:util";
import type { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { protocolDigest } from "../../../langflowContracts";

export type RetainedExecutionPublication = Pick<
	Awaited<ReturnType<typeof lockExecution>>,
	"executionId" | "flowId" | "publicationId" | "publication" | "snapshot" | "submissionBytes" | "submission"
>;

export function readExecutionPublication(execution: RetainedExecutionPublication) {
	const { snapshot, publication, submission, submissionBytes } = execution;
	if (
		snapshot.engine !== "langflow" ||
		submission.executionId !== execution.executionId ||
		submission.publicationId !== execution.publicationId ||
		publication.publicationId !== execution.publicationId ||
		publication.flowId !== execution.flowId ||
		snapshot.flow.id !== execution.flowId ||
		snapshot.flow.version !== snapshot.revision ||
		publication.revision !== snapshot.revision ||
		publication.documentHash !== snapshot.documentHash ||
		publication.componentManifestHash !== snapshot.componentManifestHash ||
		submission.submissionDigest !== protocolDigest(submissionBytes) ||
		!isDeepStrictEqual(JSON.parse(submissionBytes), { publication, snapshot })
	)
		throw new Error("execution_publication_conflict");
	return { publication, snapshot, graphDocument: snapshot.graphDocument };
}
