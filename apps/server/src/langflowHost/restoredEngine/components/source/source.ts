import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../../langflowContracts";
import { EngineSnapshotReceiptSchema } from "../../../../services/langflowBackup/engineSnapshot/components/receipt";
import { manifestName } from "../../../../services/langflowBackup/manifest";
import { PairedJournal, PairedRequestSchema } from "../../../../services/langflowBackup/pairedJournal";
import { readSnapshot } from "../../../../services/langflowBackup/readSnapshot";
import type { EngineInstallIntent, RestoredEngineInput } from "../../contracts";
import type { InstallContext } from "../context";

export async function readEngineSource(ctx: InstallContext, input: RestoredEngineInput) {
	const block = input.block;
	if (block.reason.kind !== "restore") throw new Error("restored_engine_restore_required");
	const journal = await PairedJournal.open(ctx, block.reason.snapshotId);
	const request = PairedRequestSchema.parse(await journal.read("request"));
	const restored = await journal.read("restored");
	const payload = join(block.reason.directory, "payload");
	if (request.kind !== "restore" || request.directory !== block.reason.directory ||
		!isDeepStrictEqual(await journal.read("block"), block) ||
		!isDeepStrictEqual(restored, { payload, manifestDigest: block.reason.manifestDigest, targetHome: ctx.identity.home }) ||
		await realpath(payload) !== payload)
		throw new Error("restored_engine_copy_receipt_conflict");
	const manifest = await readSnapshot(payload);
	const manifestBytes = await privateText(join(payload, manifestName));
	if (!isDeepStrictEqual(manifest, JSON.parse(manifestBytes)) || protocolDigest(manifestBytes) !== block.reason.manifestDigest ||
		manifest.snapshotId !== block.reason.snapshotId || manifest.sourceDataHomeId !== block.reason.sourceDataHomeId ||
		!isDeepStrictEqual(manifest.compatibility, request.compatibility))
		throw new Error("restored_engine_manifest_conflict");
	const receiptBytes = await privateText(join(payload, "engine", "receipt.json"));
	const entry = manifest.files.find((file) => file.path === "engine/receipt.json");
	if (!entry || entry.sha256 !== protocolDigest(receiptBytes) || entry.size !== Buffer.byteLength(receiptBytes))
		throw new Error("restored_engine_receipt_changed");
	const receipt = EngineSnapshotReceiptSchema.parse(JSON.parse(receiptBytes));
	if (!isDeepStrictEqual(receipt.binding, {
		snapshotId: manifest.snapshotId, sourceHostId: manifest.sourceHostId, sourceDataHomeId: manifest.sourceDataHomeId,
		boundaryReceiptId: manifest.boundary.receiptId, compatibility: manifest.compatibility,
	})) throw new Error("restored_engine_capture_binding_conflict");
	const database = manifest.files.find((file) => file.path === "engine/database.sqlite");
	const secret = manifest.files.find((file) => file.path === "secrets/engine-secret");
	if (!database || !secret || database.executable || secret.executable ||
		database.sha256 !== receipt.database.sha256 || database.size !== receipt.database.size ||
		secret.sha256 !== receipt.secret.sha256 || secret.size !== receipt.secret.size ||
		secret.sha256 !== manifest.compatibility.secretVersion || receipt.revisions.join(",") !== manifest.compatibility.engineDatabaseVersion)
		throw new Error("restored_engine_capture_files_conflict");
	const source = (sourceBytes: string) => ({ sourceBytes, sourceDigest: protocolDigest(sourceBytes) });
	const capture: EngineInstallIntent["capture"] = {
		snapshotId: manifest.snapshotId, sourceHostId: manifest.sourceHostId, sourceDataHomeId: manifest.sourceDataHomeId,
		boundaryReceiptId: manifest.boundary.receiptId, manifest: source(manifestBytes), engineReceipt: source(receiptBytes),
		database: receipt.database, secret: receipt.secret, revisions: receipt.revisions, tables: receipt.tables,
	};
	return { payload, capture, compatibility: manifest.compatibility };
}

async function privateText(path: string) {
	if (await realpath(path) !== path) throw new Error("restored_engine_source_path_unsafe");
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
			throw new Error("restored_engine_source_file_unsafe");
		return await file.readFile("utf8");
	} finally {
		await file.close();
	}
}
