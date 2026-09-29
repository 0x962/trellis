import { canonicalReviewClassificationRequest, ReviewClassificationRequestV1Schema } from "../../../langflowContracts/review";
import type { ReviewGateRequest } from "../invocationProtocol";

export function classificationRequest(
	visit: Pick<ReviewGateRequest, "executionId" | "publicationId" | "engineJobId" | "classificationRequestId" | "diffId" | "reviewedHead">,
	gates: ReadonlyArray<{ nodeId: string; reviewArea: "frontend" | "backend" }>,
) {
	const request = ReviewClassificationRequestV1Schema.parse({
		version: 1,
		executionId: visit.executionId,
		publicationId: visit.publicationId,
		engineJobId: visit.engineJobId,
		classificationRequestId: visit.classificationRequestId,
		diffId: visit.diffId,
		reviewedHead: visit.reviewedHead,
		gates: gates.map(({ nodeId, reviewArea }) => ({ nodeId, reviewArea }))
			.toSorted((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0),
	});
	return canonicalReviewClassificationRequest(request);
}
