import { PublishDocumentV1InputSchema, type FlowDocumentV1, type FlowDocumentActionResultV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor } from "../../../context";
import { completeDocumentAction, readDocumentPublicationState } from "../../../db/queries/langflowDocuments";
import { invalidInput } from "../../../errors";
import type { IoCtx } from "../../support";
import type { DocumentActionServices } from "../documentActionServices";
import { documentBytes } from "../documentBytes";
import { publishDocument } from "../publishDocument";
import { capturePublication } from "./components/capturePublication/capturePublication";

export const publishSavedDocument = async (ctx: IoCtx, value: unknown, services: DocumentActionServices): Promise<FlowDocumentActionResultV1> => {
	requireActor(ctx.core);
	const input = PublishDocumentV1InputSchema.parse(value);
	const requestBytes = documentBytes(input);
	const checkInstalled = () => {
		const identity = services.installedIdentity();
		if (identity.enginePackageDigest !== input.enginePackageDigest || identity.componentManifestHash !== input.componentManifestHash)
			throw invalidInput("enginePackageDigest", "The installed package no longer matches the publication request.");
	};
	const captured = await ctx.newTx((tx) => capturePublication(ctx.core, tx, input, requestBytes, checkInstalled));
	if (captured.state === "completed") return { requestId: input.requestId, document: captured.document };
	const publisher = await services.publisher();
	if (publisher.enginePackageDigest !== input.enginePackageDigest || publisher.componentManifestHash !== input.componentManifestHash)
		throw invalidInput("enginePackageDigest", "The publisher does not match the retained publication request.");
	if (captured.replay && !publisher.recover) return { state: "pending" as const, requestId: input.requestId };
	const publication = await publishDocument(ctx, { flow: input.flowId, revision: input.expectedVersion }, captured.replay ? {
		...publisher,
		validate: async () => [],
		publish: async (document) => {
			const recovered = await publisher.recover!(document);
			if (recovered === null) throw new Error("publication_receipt_unknown");
			return recovered;
		},
	} : publisher);
	if (publication === null) {
		const status = await ctx.newTx((tx) => readDocumentPublicationState(tx, { flowId: input.flowId, revision: input.expectedVersion }));
		if (status.state.state === "blocked") return { state: "blocked" as const, diagnostics: status.state.diagnostics };
		return { state: "pending" as const, requestId: input.requestId };
	}
	if (publication.enginePackageDigest !== input.enginePackageDigest || publication.componentManifestHash !== input.componentManifestHash ||
		publication.documentHash !== input.expectedDocumentHash || publication.revision !== input.expectedVersion || publication.flowId !== input.flowId)
		throw invalidInput("publication", "The immutable publication does not match the request.");
	const document: FlowDocumentV1 = {
		...captured.base.snapshot,
		publication: { state: "published", revision: input.expectedVersion, publication },
		lastExecutablePublication: publication,
	};
	const committed = await ctx.newTx(async (tx) => {
		await tx.execute(sql`SELECT id FROM flows WHERE id = ${input.flowId} FOR UPDATE`);
		return completeDocumentAction(tx, { flowId: input.flowId, requestId: input.requestId, document });
	});
	return { requestId: input.requestId, document: committed };
};
