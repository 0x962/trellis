import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { langflowExecutions } from "../../../../db/tables/langflowExecution";
import { protocolDigest, type DeliveryAuthorityV1 } from "../../../../langflowContracts";
import { DispatchGate, DispatchReceiptArchive } from "../../../../langflowHost";
import type { testFixture } from "../../../../services/flowExecutions/testFixture";
import type { ClassificationDependencies } from "../../../../services/langflowGates/classifyReviewArea";
import { classificationRequest } from "../../../../services/langflowGates/classificationRequest";
import type { ReviewGateRequest } from "../../../../services/langflowGates/invocationProtocol";
import type { ReviewGateInvocationCtx } from "../../../../services/langflowGates/invokeReviewGate";
import { gateFixture } from "../../../../services/langflowGates/reviewGate/components/fixture";
import { langflowReviewGate } from "../../langflowReviewGate";

export async function invocationFixture(h: Awaited<ReturnType<typeof testFixture>>, provider: ClassificationDependencies) {
	const f = await gateFixture(h);
	const root = mkdtempSync(join(tmpdir(), "trellis-review-http-"));
	const home = join(root, "home");
	mkdirSync(home);
	const dataHomeId = crypto.randomUUID();
	const gate = DispatchGate.create({
		directory: `${home}.langflow-authority/dispatch`, dataHomeId,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			withReconciliation: async () => { throw new Error("unused"); },
		},
	});
	const control = { gate, identity: { version: 1 as const, home, hostId: "host", dataHomeId } };
	const archive = DispatchReceiptArchive.open(control);
	const authority: DeliveryAuthorityV1 = {
		version: 1, executionId: f.input.executionId, publicationId: f.input.publication.publicationId,
		engineJobId: crypto.randomUUID(), engineEpoch: 1, hostId: "host", projectId: "project",
		publicationDigest: protocolDigest(f.input.executionId), ownerId: "owner", ownershipRevision: 1,
		capabilityId: "capability", permissions: ["review.classify", "classification.deliver"],
		issuedAt: new Date(h.ctx.now.getTime() - 1000).toISOString(),
		expiresAt: new Date(h.ctx.now.getTime() + 60000).toISOString(),
	};
	await h.run(async (tx) => {
		const [row] = await tx.select().from(langflowExecutions).where(eq(langflowExecutions.executionId, f.input.executionId));
		const snapshot = { ...row!.snapshot, engine: "langflow", componentManifestHash: row!.publication.componentManifestHash,
				graphDocument: {
					trellisReviewGatesV1: { frontVertex: { nodeId: "front", reviewArea: "frontend" }, backVertex: { nodeId: "back", reviewArea: "backend" } },
					nodes: ["frontVertex", "backVertex"].map((id) => ({ id, data: { type: "TrellisReviewGateV1" } })),
				},
			} as const;
		const submissionBytes = JSON.stringify({ publication: row!.publication, snapshot });
		await tx.update(langflowExecutions).set({ authority, engineJobId: authority.engineJobId, snapshot, submissionBytes, submission: { ...row!.submission, submissionDigest: protocolDigest(submissionBytes) } }).where(eq(langflowExecutions.executionId, f.input.executionId));
	});
	const authorityBytes = JSON.stringify(authority);
	archive.writeAuthority({ authorityBytes, issuanceReceiptId: "issued" });
	const request: ReviewGateRequest = {
		version: 1, requestId: crypto.randomUUID(), classificationRequestId: crypto.randomUUID(),
		classificationRequestDigest: "0".repeat(64), executionId: f.input.executionId,
		publicationId: authority.publicationId, engineJobId: authority.engineJobId, engineEpoch: 1,
		nodeId: "front", occurrenceKey: "front:step:1", parentOccurrenceKey: null, phase: "step", iterationPath: [],
		diffId: f.input.diffId, reviewedHead: f.input.reviewedHead,
		specHash: protocolDigest(JSON.stringify({ nodeId: "front", reviewArea: "frontend" })),
	};
	request.classificationRequestDigest = protocolDigest(classificationRequest(request, f.input.publication.gates));
	const requests = new Map<string, string>();
	requests.set(request.occurrenceKey, JSON.stringify(request));
	const ctx: ReviewGateInvocationCtx = {
		...f.ctx, now: () => h.ctx.now, control: { gate, archive },
		withAuthenticatedEngine: async (authorization, operation) => {
			if (authorization !== "Bearer secret") throw new Error("sidecar_authentication_denied");
			return operation({ id: "observation", identity: { hostId: "host", ownerId: "owner", dataHomeId, instanceId: "instance", manifestDigest: "a".repeat(64) }, observedAt: h.ctx.now.toISOString(), endpoint: "http://127.0.0.1:9999" });
		},
		resolveOccurrence: async ({ request: current, requestBytes }) => {
			if (requests.get(current.occurrenceKey) !== requestBytes) throw new Error("review_gate_occurrence_conflict");
			return { requestBytes, engineVertexId: current.nodeId === "front" ? "frontVertex" : "backVertex",
				visits: [...requests.values()].map((bytes) => {
					const visit = JSON.parse(bytes);
					return { requestBytes: bytes, engineVertexId: visit.nodeId === "front" ? "frontVertex" : "backVertex",
						waitBytes: JSON.stringify({ kind: "review", waitId: `wait:${visit.requestId}`, request: {
							version: 1, executionId: visit.executionId, publicationId: visit.publicationId, engineJobId: visit.engineJobId,
							engineEpoch: visit.engineEpoch, engineRequestId: visit.requestId, actionKey: `action:${visit.requestId}`,
							occurrence: { nodeId: visit.nodeId, occurrenceKey: visit.occurrenceKey, parentOccurrenceKey: visit.parentOccurrenceKey, phase: visit.phase, iterationPath: visit.iterationPath },
							reviewArea: visit.nodeId === "front" ? "frontend" : "backend", visit, visitDigest: protocolDigest(bytes), deadlineRefs: [],
						} }) };
				}) };

		},
		accept: async (input) => {
			const response = JSON.parse(input.resultBytes);
			return { state: "received", status: 200, contentType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({
				version: 1, executionId: response.visit.executionId, engineJobId: response.visit.engineJobId,
				engineRequestId: response.visit.requestId, classificationReceiptId: response.result.classificationReceiptId,
				resultDigest: protocolDigest(input.resultBytes), engineWaitId: input.engineWaitId, acceptanceId: "accepted",
				signalId: crypto.randomUUID(), enqueueObligationId: crypto.randomUUID(), acceptedAt: h.ctx.now.toISOString(),
			})) };
		},
	};
	const app = langflowReviewGate({ context: async () => ctx }, provider);
	const send = (value: unknown = request, headers: Record<string, string> = {}) => app.request(
		"http://localhost/api/langflow-private/v1/review-gates", {
			method: "POST", headers: { Authorization: "Bearer secret", "X-Trellis-Capability-Id": "capability", ...headers },
			body: JSON.stringify({ requestBytes: JSON.stringify(value), authorityBytes }),
		},
	);
	const sendContext = () => app.request("http://localhost/api/langflow-private/v1/review-gates/context", {
		method: "POST", headers: { Authorization: "Bearer secret", "X-Trellis-Capability-Id": "capability" },
		body: JSON.stringify({ authorityBytes, requestBytes: JSON.stringify({ version: 1, executionId: request.executionId,
			publicationId: request.publicationId, engineJobId: request.engineJobId, engineEpoch: request.engineEpoch,
			classificationRequestId: request.classificationRequestId }) }),
	});
	return { ...f, request, requests, ctx, gate, send, sendContext, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
