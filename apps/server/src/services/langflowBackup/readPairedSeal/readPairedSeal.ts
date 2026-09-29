import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ReconciliationFactsSchema } from "../../../db/queries/langflowExecution";
import { protocolDigest } from "../../../langflowContracts";
import type { LangflowHostControl } from "../../../langflowHost";
import { CaptureGrantSchema, CaptureRecordSchema } from "../../../langflowHost/captureAuthority/schema/schema";
import { ReconciliationReceiptSchema } from "../../../langflowHost/dispatchGate/store/schema";
import { EngineSnapshotReceiptSchema } from "../engineSnapshot/components/receipt";
import { manifestName, SnapshotManifestSchema } from "../manifest/manifest";
import { PairedJournal, PairedRequestSchema } from "../pairedJournal";
import { readSnapshot } from "../readSnapshot";

export async function readPairedSeal(ctx: { control: LangflowHostControl }, input: { snapshotId: string }) {
	const journal = await PairedJournal.open(ctx.control, input.snapshotId);
	const request = PairedRequestSchema.parse(await journal.read("request"));
	const block = ReconciliationReceiptSchema.shape.block.parse(await journal.read("block"));
	const directory = request.kind === "restore" ? join(request.directory, "payload") : request.directory;
	const manifest = await readSnapshot(directory);
	const manifestBytes = await readFile(join(directory, manifestName), "utf8");
	const manifestDigest = protocolDigest(manifestBytes);
	if (manifest.snapshotId !== request.snapshotId || !isDeepStrictEqual(manifest.compatibility, request.compatibility))
		throw new Error("paired_seal_request_mismatch");
	if (request.kind === "restore") {
		if (
			block.reason.kind !== "restore" ||
			block.reason.manifestDigest !== manifestDigest ||
			block.reason.snapshotId !== manifest.snapshotId ||
			block.reason.sourceDataHomeId !== manifest.sourceDataHomeId ||
			block.reason.directory !== request.directory
		)
			throw new Error("paired_restore_block_mismatch");
	} else if (
		block.reason.kind !== "capture" ||
		block.reason.snapshotId !== manifest.snapshotId ||
		manifest.sourceDataHomeId !== request.dataHomeId ||
		manifest.sourceHostId !== request.hostId
	) {
		throw new Error("paired_capture_block_mismatch");
	}
	if (block.dataHomeId !== ctx.control.identity.dataHomeId) throw new Error("paired_seal_home_mismatch");
	if (request.kind === "capture") {
		const record = CaptureRecordSchema.parse(await journal.read("grant"));
		const grant = CaptureGrantSchema.parse(JSON.parse(record.grantBytes));
		if (
			!isDeepStrictEqual(grant.block, block) ||
			grant.snapshotId !== manifest.snapshotId ||
			grant.boundaryReceiptId !== manifest.boundary.receiptId ||
			grant.identity.hostId !== manifest.sourceHostId ||
			grant.identity.dataHomeId !== manifest.sourceDataHomeId
		)
			throw new Error("paired_capture_grant_mismatch");
		const saved = await journal.read("sealed");
		if (saved !== null) {
			const seal = z.strictObject({ manifest: SnapshotManifestSchema, manifestDigest: z.string() }).parse(saved);
			if (seal.manifestDigest !== manifestDigest || !isDeepStrictEqual(seal.manifest, manifest))
				throw new Error("paired_capture_seal_changed");
		}
	}
	const engineBytes = await readFile(join(directory, "engine", "receipt.json"), "utf8");
	const engine = EngineSnapshotReceiptSchema.parse(JSON.parse(engineBytes));
	if (
		!isDeepStrictEqual(engine.binding, {
			snapshotId: manifest.snapshotId,
			sourceDataHomeId: manifest.sourceDataHomeId,
			sourceHostId: manifest.sourceHostId,
			boundaryReceiptId: manifest.boundary.receiptId,
			compatibility: manifest.compatibility,
		})
	)
		throw new Error("paired_engine_seal_mismatch");
	const database = manifest.files.find((entry) => entry.path === "engine/database.sqlite");
	const secret = manifest.files.find((entry) => entry.path === "secrets/engine-secret");
	if (
		!database ||
		!secret ||
		database.sha256 !== engine.database.sha256 ||
		database.size !== engine.database.size ||
		secret.sha256 !== engine.secret.sha256 ||
		secret.size !== engine.secret.size ||
		secret.sha256 !== manifest.compatibility.secretVersion ||
		engine.revisions.join(",") !== manifest.compatibility.engineDatabaseVersion
	)
		throw new Error("paired_engine_files_mismatch");
	const nativeBytes = await readFile(join(directory, "workspaces", "native-launches", "inventory.json"), "utf8");
	const stopBytes = await readFile(join(directory, "workspaces", "stop-reconciliation.json"), "utf8");
	const factsPath = "workspaces/trellis-database-facts.json";
	if (!manifest.files.some((entry) => entry.path === factsPath)) throw new Error("paired_trellis_facts_unavailable");
	const trellisBytes = await readFile(join(directory, factsPath), "utf8");
	const trellisFacts = ReconciliationFactsSchema.parse(JSON.parse(trellisBytes));
	if (trellisFacts.migrations.sourceDigest !== manifest.compatibility.trellisDatabaseVersion)
		throw new Error("paired_trellis_facts_digest_mismatch");
	const source = (sourceBytes: string) => ({ sourceBytes, sourceDigest: protocolDigest(sourceBytes) });
	return {
		request,
		block,
		directory,
		manifest,
		manifestDigest,
		engine,
		trellisFacts,
		sources: {
			trellisDatabase: source(trellisBytes),
			engineDatabase: source(engineBytes),
			secret: source(JSON.stringify({ sha256: secret.sha256, size: secret.size })),
			nativeAttempts: source(nativeBytes),
			stopObligations: source(stopBytes),
			snapshotSeal: source(manifestBytes),
		},
	};
}
