import { isDeepStrictEqual } from "node:util";
import { type FlowDiagnosticV1, FlowPublicationV1Schema } from "@trellis/api";
import { requireActor } from "../../context.ts";
import {
	insertDocumentPublication,
	readDocumentPublication,
	readDocumentPublicationState,
	readDocumentRevision,
	writeDocumentPublicationState,
} from "../../db/queries/langflowDocuments";
import { fail, invalidInput } from "../../errors.ts";
import { resolveFlow } from "../flows/queries.ts";
import type { IoCtx } from "../support.ts";
import type { DocumentPublisher, SavedDocument } from "./publisher.ts";

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
		if (flow.version !== input.revision) throw fail("FLOW_VERSION_CONFLICT", { version: flow.version });
		const key = { flowId: flow.id, revision: input.revision };
		const stored = await readDocumentRevision(tx, key);
		if (stored === undefined || stored.snapshot.engine !== "langflow") {
			throw invalidInput("flow", "Save a Langflow document before publication.");
		}
		const publication = await readDocumentPublication(tx, key);
		const status = await readDocumentPublicationState(tx, key);
		return {
			key,
			publication,
			status,
			document: { snapshot: stored.snapshot, sourceBytes: stored.sourceBytes } satisfies SavedDocument,
		};
	});
	if (prepared.publication !== undefined) return prepared.publication;
	const { key, document, status } = prepared;
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
	let publication;
	let diagnostics: FlowDiagnosticV1[];
	try {
		diagnostics = await engine.validate(document);
		if (!diagnostics.some((item) => item.severity === "error")) {
			publication = FlowPublicationV1Schema.parse(await engine.publish(document));
		}
	} catch {
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
