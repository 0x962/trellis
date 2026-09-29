import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { FlowDiagnosticV1Schema } from "@trellis/api";
import { z } from "zod";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release/loadCandidatePackage/loadCandidatePackage.ts";
import type { LiveOwnership } from "../../../langflowHost/contracts";
import { documentBytes } from "../documentBytes";
import type { PublicationActions, PublicationBinding, publicationDispatch } from "../publicationDispatch";
import type { PublicationProof } from "../publicationProof";
import type { DocumentPublisher, SavedDocument } from "../publisher";

export type PublicationDispatch = ReturnType<typeof publicationDispatch>;

const diagnosticsSchema = z.strictObject({ diagnostics: z.array(FlowDiagnosticV1Schema) });

export const installedPublisher = (input: {
	package: CandidatePackage;
	ownership: LiveOwnership;
	authenticationFile: string;
	dispatch: PublicationDispatch;
}): DocumentPublisher => {
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
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await response.arrayBuffer());
	};
	const operation = (document: SavedDocument) => {
		if (document.snapshot.componentManifestHash !== identity.componentManifestHash)
			throw new Error("publication_manifest_conflict");
		const requestBytes = body(document);
		const digest = createHash("sha256").update(requestBytes).digest("hex");
		const binding: PublicationBinding = {
			effectId: `publication:${document.snapshot.flow.id}:${document.snapshot.revision}`,
			kind: "publication",
			executionId: null,
			attemptId: null,
			jobId: null,
			requestId: digest,
			payloadDigest: digest,
		};
		const proof = (responseBytes: string, responseKind: PublicationProof["responseKind"]): PublicationProof => ({
			requestBytes,
			responseBytes,
			responseKind,
		});
		const actions: PublicationActions = {
			read: async () => {
				const responseBytes = await request(
					`/trellis-v1/publications/${encodeURIComponent(document.snapshot.flow.id)}/${document.snapshot.revision}`,
				);
				return responseBytes === null ? null : proof(responseBytes, "recovered");
			},
			write: async () => {
				const responseBytes = await request("/trellis-v1/publications", requestBytes);
				if (responseBytes === null) throw new Error("publication_outcome_unknown");
				return proof(responseBytes, "created");
			},
		};
		return { binding, actions };
	};
	return {
		enginePackageDigest: identity.enginePackageDigest,
		componentManifestHash: identity.componentManifestHash,
		recover: (document) => {
			const { binding, actions } = operation(document);
			return input.dispatch.recover(binding, actions);
		},
		validate: async (document) => {
			const response = await request("/trellis-v1/publications/validate", body(document));
			if (response === null) throw new Error("publication_validation_unknown");
			return diagnosticsSchema.parse(JSON.parse(response)).diagnostics;
		},
		publish: (document) => {
			const { binding, actions } = operation(document);
			return input.dispatch.run(binding, actions);
		},
	};
};
