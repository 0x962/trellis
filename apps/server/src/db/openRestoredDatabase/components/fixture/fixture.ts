import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../../../langflowContracts";
import { LangflowHostControl } from "../../../../langflowHost";
import { installRestoredDatabase } from "../../../../langflowHost/restoredDatabase";
import { manifestName, snapshotRoots } from "../../../../services/langflowBackup/manifest";
import { sealSnapshot } from "../../../../services/langflowBackup/sealSnapshot";
import { openDb } from "../../../client";
import { readReconciliationFacts } from "../../../queries/langflowExecution/reconciliationFacts";
import { migratedTar } from "../../../testDb";

export async function restoredDatabaseFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-database-open-")));
	const home = join(root, "target");
	const directory = join(root, "envelope");
	const payload = join(directory, "payload");
	await mkdir(home, { mode: 0o700 });
	await mkdir(payload, { recursive: true, mode: 0o700 });
	for (const name of snapshotRoots) await mkdir(join(payload, name), { mode: 0o700 });
	const db = await openDb(join(payload, "trellis/db"), await migratedTar());
	const expected = await db.transaction(readReconciliationFacts);
	await db.$client.close();
	const manifest = await sealSnapshot({
		directory: payload,
		metadata: {
			snapshotId: crypto.randomUUID(),
			sourceDataHomeId: crypto.randomUUID(),
			sourceHostId: crypto.randomUUID(),
			createdAt: "2026-09-29T00:00:00.000Z",
			compatibility: {
				trellisRelease: "fixture",
				enginePackageDigest: "a".repeat(64),
				trellisDatabaseVersion: expected.migrations.sourceDigest,
				engineDatabaseVersion: "fixture",
				secretVersion: "fixture",
			},
			boundary: { kind: "quiesced-export", receiptId: "fixture" },
			unavailable: [],
		},
	});
	const { block } = LangflowHostControl.initialize({
		home,
		initialBlock: {
			requestId: crypto.randomUUID(),
			reason: {
				kind: "restore",
				directory,
				snapshotId: manifest.snapshotId,
				sourceDataHomeId: manifest.sourceDataHomeId,
				manifestDigest: protocolDigest(await readFile(join(payload, manifestName), "utf8")),
			},
		},
	});
	const installed = await installRestoredDatabase({ home, signal: new AbortController().signal });
	return {
		home,
		dataDir: join(home, "db"),
		block,
		expected,
		installReceiptId: installed.receiptId,
		remove: () => rm(root, { recursive: true, force: true }),
	};
}
