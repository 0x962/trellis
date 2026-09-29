import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FlowDocumentSnapshotV1Schema, FlowPublicationV1Schema } from "@trellis/api";
import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";
import type { PublicationBinding } from "../publicationDispatch";

const proofSchema = z.strictObject({
	requestBytes: z.string(),
	responseBytes: z.string(),
	responseKind: z.enum(["created", "recovered"]),
});
const requestSchema = z.strictObject({
	enginePackageDigest: z.string(),
	snapshot: FlowDocumentSnapshotV1Schema,
	sourceBytes: z.string(),
});
const recoverySchema = z.object({
	requestDigest: z.string(),
	publication: FlowPublicationV1Schema,
	snapshot: FlowDocumentSnapshotV1Schema,
	sourceBytes: z.string(),
});
export type PublicationProof = z.infer<typeof proofSchema>;

export const readPublicationProof = (binding: PublicationBinding, value: unknown) => {
	const proof = proofSchema.parse(value);
	const request = requestSchema.parse(JSON.parse(proof.requestBytes));
	const snapshot = request.snapshot;
	const digest = protocolDigest(proof.requestBytes);
	const source = Buffer.from(request.sourceBytes, "base64");
	if (
		binding.kind !== "publication" ||
		binding.executionId !== null ||
		binding.attemptId !== null ||
		binding.jobId !== null ||
		binding.requestId !== digest ||
		binding.payloadDigest !== digest ||
		binding.effectId !== `publication:${snapshot.flow.id}:${snapshot.revision}` ||
		snapshot.engine !== "langflow" ||
		snapshot.flow.version !== snapshot.revision ||
		source.toString("base64") !== request.sourceBytes ||
		createHash("sha256").update(source).digest("hex") !== snapshot.documentHash
	)
		throw new Error("publication_proof_binding_conflict");
	const content = {
		engine: snapshot.engine,
		schemaVersion: snapshot.schemaVersion,
		graphDocument: snapshot.graphDocument,
		componentManifestHash: snapshot.componentManifestHash,
	};
	if (!isDeepStrictEqual(JSON.parse(source.toString("utf8")), content)) throw new Error("publication_source_conflict");
	const response: unknown = JSON.parse(proof.responseBytes);
	const recovered = proof.responseKind === "recovered" ? recoverySchema.parse(response) : null;
	if (
		recovered &&
		(recovered.requestDigest !== digest ||
			recovered.sourceBytes !== request.sourceBytes ||
			!isDeepStrictEqual(recovered.snapshot, snapshot))
	)
		throw new Error("publication_proof_recovery_conflict");
	const receipt = recovered?.publication ?? FlowPublicationV1Schema.parse(response);
	if (
		receipt.flowId !== snapshot.flow.id ||
		receipt.revision !== snapshot.revision ||
		receipt.documentHash !== snapshot.documentHash ||
		receipt.componentManifestHash !== snapshot.componentManifestHash ||
		receipt.enginePackageDigest !== request.enginePackageDigest
	)
		throw new Error("publication_receipt_identity_mismatch");
	return { proof, receipt };
};
