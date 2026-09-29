import { isDeepStrictEqual } from "node:util";
import { type FlowDiagnosticV1, type FlowPublicationV1, FlowPublicationV1Schema } from "@trellis/api";
import { requireActor } from "../../../context.ts";
import {
	insertDocumentPublication,
	readDocumentPublication,
	readDocumentPublicationState,
	readDocumentRevision,
	writeDocumentPublicationState,
} from "../../../db/queries/langflowDocuments";
import { fail, invalidInput } from "../../../errors.ts";
import { resolveFlow } from "../../flows/flows.ts";
import type { IoCtx } from "../../support.ts";
import type { DocumentPublisher, SavedDocument } from "../publisher";

const diagnostic = (code: string, message: string): FlowDiagnosticV1 => ({
	code,
	message,
	severity: "error",
	path: [],
});

export const publishDocument = async (
	ctx: IoCtx,
	input: { flow: string; revision: number },
	engine: DocumentPublisher,
) => {
	requireActor(ctx.core);
	const prepared = await ctx.newTx(async (tx) => {
		const flow = await resolveFlow(tx, input.flow);
		const key = { flowId: flow.id, revision: input.revision };
		const stored = await readDocumentRevision(tx, key);
		if (stored === undefined || stored.snapshot.engine !== "langflow") {
			throw invalidInput("flow", "Save a Langflow document before publication.");
		}
		const publication = await readDocumentPublication(tx, key);
		const status = await readDocumentPublicationState(tx, key);
		return {
			key,
			currentVersion: flow.version,
			publication,
			status,
			document: { snapshot: stored.snapshot, sourceBytes: stored.sourceBytes } satisfies SavedDocument,
		};
	});
	if (prepared.publication !== undefined) return prepared.publication;
	const { key, document, status } = prepared;
	const stale = prepared.currentVersion !== input.revision;
	if (stale && !engine.recover) throw fail("FLOW_VERSION_CONFLICT", { version: prepared.currentVersion });
	const recordFailure = async (state: "failed" | "blocked", diagnostics: FlowDiagnosticV1[]) => {
		await ctx.newTx((tx) =>
			writeDocumentPublicationState(tx, {
				...key,
				expectedVersion: status.version,
				state: { state, revision: key.revision, diagnostics },
			}),
		);
		ctx.emit({ type: "flows.changed", id: key.flowId });
	};
	if (document.snapshot.componentManifestHash !== engine.componentManifestHash) {
		await recordFailure("blocked", [
			diagnostic("component_manifest_mismatch", "The saved component manifest does not match the installed engine."),
		]);
		return null;
	}
	let publication: FlowPublicationV1 | undefined;
	let diagnostics: FlowDiagnosticV1[];
	let stage: "validate" | "publish" | "receipt" = "validate";
	try {
		diagnostics = stale ? [] : await engine.validate(document);
		if (!diagnostics.some((item) => item.severity === "error")) {
			stage = "publish";
			const response = stale ? await engine.recover!(document) : await engine.publish(document);
			if (response === null) return null;
			stage = "receipt";
			publication = FlowPublicationV1Schema.parse(response);
		}
	} catch {
		ctx.log("flow publication failed", {
			flowId: key.flowId,
			revision: key.revision,
			requestId: ctx.core.reqId,
			stage,
			category: stage === "receipt" ? "invalid_receipt" : "engine_error",
		});
		await recordFailure("failed", [
			diagnostic(
				"engine_publication_failed",
				"The engine did not confirm publication. The saved document remains available.",
			),
		]);
		return null;
	}
	if (publication === undefined) {
		await recordFailure("blocked", diagnostics);
		return null;
	}
	if (
		publication.flowId !== key.flowId ||
		publication.revision !== key.revision ||
		publication.documentHash !== document.snapshot.documentHash ||
		publication.componentManifestHash !== document.snapshot.componentManifestHash ||
		publication.enginePackageDigest !== engine.enginePackageDigest
	) {
		await recordFailure("blocked", [
			diagnostic(
				"publication_identity_mismatch",
				"The engine receipt does not identify the saved document and installed package.",
			),
		]);
		return null;
	}
	const confirmed = publication;
	const saved = await ctx.newTx(async (tx) => {
		const existing = await readDocumentPublication(tx, key);
		if (existing !== undefined) {
			if (!isDeepStrictEqual(existing, confirmed))
				throw invalidInput("publication", "The revision already has a different publication receipt.");
			return existing;
		}
		return insertDocumentPublication(tx, confirmed);
	});
	ctx.emit({ type: "flows.changed", id: key.flowId });
	return saved;
};
