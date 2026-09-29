import { executionViewV1Example, publicationV1Example } from "@trellis/api";
import { ulid } from "ulid";
import { classificationStore } from "../../../../../db/queries/langflowExecution/classification.ts";
import { reserveExecution } from "../../../../../db/queries/langflowExecution/executions.ts";
import { langflowDocumentPublications, langflowDocumentRevisions } from "../../../../../db/tables/langflowDocuments";
import { protocolDigest } from "../../../../../langflowContracts";
import type { testFixture } from "../../../../flowExecutions/testFixture";
import type { ServiceCtx } from "../../../../support.ts";
import type { ReviewGateInput } from "../../reviewGate.ts";

export async function gateFixture(h: Awaited<ReturnType<typeof testFixture>>) {
	const setup = await h.createExecution();
	const execution = await setup.create();
	const sourceBytes = Buffer.from(execution.id);
	const documentHash = protocolDigest(execution.id);
	const publication = { ...publicationV1Example, publicationId: ulid(), flowId: execution.flowId, documentHash };
	const snapshot = {
		...executionViewV1Example.snapshot,
		documentHash,
		flow: { ...executionViewV1Example.snapshot.flow, id: execution.flowId },
	};
	await h.run(async (tx) => {
		await tx.insert(langflowDocumentRevisions).values({
			flowId: execution.flowId,
			revision: snapshot.revision,
			documentHash,
			componentManifestHash: publication.componentManifestHash,
			sourceBytes,
			snapshot,
			savedAt: h.ctx.now,
		});
		await tx.insert(langflowDocumentPublications).values({
			publicationId: publication.publicationId,
			flowId: execution.flowId,
			revision: publication.revision,
			documentHash,
			componentManifestHash: publication.componentManifestHash,
			publication,
		});
	});
	const input: ReviewGateInput = {
		executionId: execution.id,
		diffId: setup.input.diffId,
		reviewedHead: setup.input.headSha,
		publication: {
			publicationId: publication.publicationId,
			gates: [
				{ nodeId: "front", reviewArea: "frontend" },
				{ nodeId: "back", reviewArea: "backend" },
			],
		},
		gateNodeId: "front",
	};
	await h.run((tx) =>
		reserveExecution(tx, {
			executionId: execution.id,
			flowId: execution.flowId,
			ticketId: execution.ticketId,
			projectId: execution.projectId,
			diffId: input.diffId,
			reviewedHead: input.reviewedHead,
			publicationId: publication.publicationId,
			publicationRecordId: publication.publicationId,
			publication,
			snapshot,
			hostId: "host",
			actorKind: "agent",
			actorName: "Test",
			requestId: crypto.randomUUID(),
			requestBytes: execution.id,
			submissionBytes: execution.id,
			submission: {
				version: 1,
				hostId: "host",
				executionId: execution.id,
				publicationId: publication.publicationId,
				requestId: crypto.randomUUID(),
				actor: { kind: "agent", name: "Test" },
				requestDigest: protocolDigest(execution.id),
				submissionDigest: protocolDigest(execution.id),
				state: "reserved",
				correlation: null,
				admission: { state: "closed", barrierId: "barrier" },
				revision: 1,
			},
			admission: { state: "closed", barrierId: "barrier" },
			revision: 1,
			createdAt: h.ctx.now,
		}),
	);
	const logs: unknown[] = [];
	const ctx: Pick<ServiceCtx, "newTx" | "log"> = {
		newTx: h.run,
		log: (...args) => {
			logs.push(args);
		},
	};
	return {
		logs,
		input,
		ctx,
		store: classificationStore,
		interrupt: async () => {
			await h.run(async (tx) => {
				const receipt = (await classificationStore.read(tx, { executionId: input.executionId }))!;
				await classificationStore.interrupt(tx, {
					executionId: input.executionId,
					ownerToken: receipt.ownerToken,
					error: "Jev gate: interrupted",
				});
			});
		},
	};
}
