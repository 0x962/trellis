import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { eq } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../../../context";
import { saveDocument } from "../../../../../db/queries/langflowDocuments";
import { flows } from "../../../../../db/tables/flows";
import type { Tx } from "../../../../../db/tx";
import { upsert } from "../../../../actors";
import type { ConversionEditIntentV1, PreparedConversionEditV1 } from "../../../../langflowMigration";
import { documentBytes } from "../../../documentBytes";
import type { SavedDocument } from "../../../publisher";
import { readEditBase } from "../readEditBase/readEditBase";

export async function commitEdit(
	ctx: ServiceCtx,
	tx: Tx,
	input: {
		intent: ConversionEditIntentV1;
		intentBytes: Buffer;
		base: SavedDocument;
		prepared: PreparedConversionEditV1;
	},
	checkInstalled: () => void,
) {
	const current = await readEditBase(ctx, tx, input);
	if (current.state === "replayed") return current.document;
	checkInstalled();
	const { intent, intentBytes, base, prepared } = input;
	if (
		!current.base.sourceBytes.equals(base.sourceBytes) ||
		!isDeepStrictEqual(current.base.snapshot, base.snapshot) ||
		!prepared.intentBytes.equals(intentBytes) ||
		prepared.base.flowId !== base.snapshot.flow.id ||
		prepared.base.revision !== base.snapshot.revision ||
		prepared.base.documentHash !== base.snapshot.documentHash ||
		prepared.base.sourceBytesHash !== createHash("sha256").update(documentBytes(base.snapshot)).digest("hex") ||
		prepared.enginePackageDigest !== intent.enginePackageDigest ||
		prepared.componentManifestHash !== intent.componentManifestHash ||
		prepared.content.componentManifestHash !== intent.componentManifestHash ||
		!prepared.sourceBytes.equals(documentBytes(prepared.content))
	)
		throw new Error("conversion_edit_preparation_conflict");
	await tx.update(flows).set(prepared.metadata).where(eq(flows.id, intent.flowId));
	const saved = await saveDocument(tx, {
		flowId: intent.flowId,
		expectedVersion: intent.expectedVersion,
		requestId: intent.requestId,
		requestBytes: intentBytes,
		sourceBytes: prepared.sourceBytes,
		content: prepared.content,
		diagnostics: [],
		savedAt: ctx.now,
	});
	if (saved.state !== "saved") throw new Error("conversion_edit_commit_conflict");
	await upsert(ctx, tx, requireActor(ctx));
	ctx.emit({ type: "flows.changed", id: intent.flowId });
	return saved.receipt;
}
