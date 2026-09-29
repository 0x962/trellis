import type {
	DeliveryAuthorityV1,
	NativeLaunchProvenanceV1,
	NativeRequestV1,
} from "../../../../apps/server/src/langflowContracts/index.ts";
import { protocolDigest } from "../../../../apps/server/src/langflowContracts/index.ts";

export const ids = {
	executionId: "execution-native-lifecycle",
	publicationId: "publication-native-lifecycle",
	engineJobId: "00000000-0000-4000-8000-000000000001",
	requestId: "00000000-0000-4000-8000-000000000002",
	takeoverOne: "00000000-0000-4000-8000-000000000003",
	takeoverTwo: "00000000-0000-4000-8000-000000000004",
	renewal: "00000000-0000-4000-8000-000000000005",
};

const digest = "1".repeat(64);

export const nativeRequest = (executionId = ids.executionId): NativeRequestV1 => ({
	version: 1,
	executionId,
	publicationId: ids.publicationId,
	engineJobId: ids.engineJobId,
	engineEpoch: 1,
	nodeId: "agent-node",
	occurrenceKey: "outer:1:inner:73:agent-node:step",
	parentOccurrenceKey: "outer:1:inner:73",
	phase: "step",
	iterationPath: [
		{ loopNodeId: "outer", round: 1 },
		{ loopNodeId: "inner", round: 73 },
	],
	admissionReceipt: {
		version: 1,
		executionId,
		publicationId: ids.publicationId,
		engineJobId: ids.engineJobId,
		engineEpoch: 1,
		admissionId: "admission-native-lifecycle",
		submissionDigest: digest,
		committedAt: "2026-09-29T10:00:00.000Z",
	},
	requestId: ids.requestId,
	specHash: "2".repeat(64),
	inputReceiptIds: ["input-native-lifecycle"],
	groupDeadlineRefs: ["deadline-outer", "deadline-inner"],
	deadlineAt: "2026-09-30T10:00:00.000Z",
});

export const launchProvenance = (
	attemptId: string,
	agentRunId = "run-native-lifecycle",
	executionId = ids.executionId,
	stepId = "step-native-lifecycle",
): NativeLaunchProvenanceV1 => {
	const request = nativeRequest(executionId);
	return {
		version: 1,
		request,
		requestDigest: protocolDigest(JSON.stringify(request)),
		stepId,
		agentRunId,
		attemptId,
		reservedAt: "2026-09-29T10:00:00.000Z",
	};
};

export const deliveryAuthority = (executionId = ids.executionId): DeliveryAuthorityV1 => ({
	version: 1,
	executionId,
	publicationId: ids.publicationId,
	engineJobId: ids.engineJobId,
	engineEpoch: 1,
	hostId: "host-native-lifecycle",
	projectId: "project-native-lifecycle",
	publicationDigest: "3".repeat(64),
	ownerId: "owner-one",
	ownershipRevision: 1,
	capabilityId: "capability-one",
	permissions: ["native.reserve", "native.read", "completion.deliver", "decision.deliver"],
	issuedAt: "2026-09-29T10:00:00.000Z",
	expiresAt: "2026-09-29T10:10:00.000Z",
});
