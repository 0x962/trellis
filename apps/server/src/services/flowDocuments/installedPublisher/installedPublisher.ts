import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { FlowDiagnosticV1Schema, type FlowPublicationV1, FlowPublicationV1Schema } from "@trellis/api";
import { z } from "zod";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release/loadCandidatePackage/loadCandidatePackage.ts";
import type { LiveOwnership } from "../../../langflowHost/contracts";
import { documentBytes } from "../documentBytes";
import type { PublicationActions, PublicationBinding, PublicationPermit } from "../publicationDispatch";
import type { DocumentPublisher, SavedDocument } from "../publisher";

export type PublicationDispatch = {
	run(binding: PublicationBinding, actions: PublicationActions): Promise<FlowPublicationV1>;
};

const diagnosticsSchema = z.strictObject({ diagnostics: z.array(FlowDiagnosticV1Schema) });

export const installedPublisher = (input: {
	package: CandidatePackage;
	ownership: LiveOwnership;
	authenticationFile: string;
	dispatch: PublicationDispatch;
}): DocumentPublisher & {
	readTerminal(
		permit: PublicationPermit,
		receiptId: string,
	): Promise<{ id: string; permit: PublicationPermit; outcome: "completed" }>;
} => {
	const identity = input.package;
	if (input.ownership.identity.manifestDigest !== identity.enginePackageDigest) {
		throw new Error("publication_owner_package_mismatch");
	}
	const endpoint = new URL(input.ownership.endpoint);
	if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.username || endpoint.password) {
		throw new Error("publication_endpoint_invalid");
	}
	const body = (document: SavedDocument) =>
		documentBytes({
			enginePackageDigest: identity.enginePackageDigest,
			snapshot: document.snapshot,
			sourceBytes: document.sourceBytes.toString("base64"),
		}).toString("utf8");
	const request = async (path: string, bytes?: string) => {
		const file = await open(input.authenticationFile, constants.O_RDONLY | constants.O_NOFOLLOW);
		let token: string;
		try {
			const metadata = await file.stat();
			if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
				throw new Error("publication_authentication_file_invalid");
			}
			token = await file.readFile("utf8");
		} finally {
			await file.close();
		}
		if (!token) throw new Error("publication_authentication_empty");
		const response = await fetch(new URL(path, endpoint), {
			method: bytes === undefined ? "GET" : "POST",
			redirect: "error",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: bytes,
		});
		if (bytes === undefined && response.status === 404) return null;
		if (!response.ok) throw new Error(`publication_http_${response.status}`);
		return response.json();
	};
	const readReceipt = async (flowId: string, revision: number, digest: string) => {
		const result = await request(`/trellis-v1/publications/${encodeURIComponent(flowId)}/${revision}`);
		if (result === null) return null;
		const saved = z.object({ requestDigest: z.string(), publication: FlowPublicationV1Schema }).parse(result);
		if (
			saved.requestDigest !== digest ||
			saved.publication.flowId !== flowId ||
			saved.publication.revision !== revision ||
			saved.publication.enginePackageDigest !== identity.enginePackageDigest ||
			saved.publication.componentManifestHash !== identity.componentManifestHash
		) {
			throw new Error("publication_replay_conflict");
		}
		return saved.publication;
	};

	return {
		enginePackageDigest: identity.enginePackageDigest,
		componentManifestHash: identity.componentManifestHash,
		recover: async (document) =>
			readReceipt(
				document.snapshot.flow.id,
				document.snapshot.revision,
				createHash("sha256").update(body(document)).digest("hex"),
			),
		validate: async (document) =>
			diagnosticsSchema.parse(await request("/trellis-v1/publications/validate", body(document))).diagnostics,
		publish: async (document) => {
			const effect = {
				flowId: document.snapshot.flow.id,
				revision: document.snapshot.revision,
				documentHash: document.snapshot.documentHash,
				enginePackageDigest: identity.enginePackageDigest,
				componentManifestHash: identity.componentManifestHash,
			};
			const bytes = body(document);
			const digest = createHash("sha256").update(bytes).digest("hex");
			return input.dispatch.run(
				{
					effectId: `publication:${effect.flowId}:${effect.revision}`,
					kind: "publication",
					executionId: null,
					attemptId: null,
					jobId: null,
					requestId: digest,
					payloadDigest: digest,
				},
				{
					read: () => readReceipt(effect.flowId, effect.revision, digest),
					write: async () => {
						const receipt = FlowPublicationV1Schema.parse(await request("/trellis-v1/publications", bytes));
						const received = {
							flowId: receipt.flowId,
							revision: receipt.revision,
							documentHash: receipt.documentHash,
							enginePackageDigest: receipt.enginePackageDigest,
							componentManifestHash: receipt.componentManifestHash,
						};
						if (!isDeepStrictEqual(effect, received)) throw new Error("publication_receipt_identity_mismatch");
						return receipt;
					},
				},
			);
		},
		readTerminal: async (permit, receiptId) => {
			const match = /^publication:([0-9A-HJKMNP-TV-Z]{26}):([1-9][0-9]*)$/.exec(permit.binding.effectId);
			if (!match || permit.binding.kind !== "publication") throw new Error("publication_permit_invalid");
			const receipt = await readReceipt(match[1]!, Number(match[2]), permit.binding.payloadDigest);
			if (receipt === null || receipt.publicationId !== receiptId) throw new Error("publication_terminal_unknown");
			return { id: receiptId, permit, outcome: "completed" };
		},
	};
};
