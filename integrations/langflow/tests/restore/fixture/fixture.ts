import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotMetadata } from "../../../../../apps/server/src/services/langflowBackup";
import { snapshotRoots } from "../../../../../apps/server/src/services/langflowBackup/manifest";

export const metadata: SnapshotMetadata = {
	snapshotId: "00000000-0000-4000-8000-000000000099",
	sourceDataHomeId: "fixture-home",
	sourceHostId: "fixture-host",
	createdAt: "2026-09-29T06:00:00.000Z",
	compatibility: {
		trellisRelease: "fixture-release",
		enginePackageDigest: "a".repeat(64),
		trellisDatabaseVersion: "declared-receipt-fixture",
		engineDatabaseVersion: "synthetic-sqlite-1",
		secretVersion: "fixture-key-1",
	},
	boundary: { kind: "quiesced-export", receiptId: "fixture-boundary-1" },
	unavailable: [{ reference: "deleted-revision-0", reason: "The source retains no bytes for this revision." }],
};

export async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "trellis-paired-restore-"));
	const snapshot = join(root, "snapshot");
	await mkdir(snapshot, { mode: 0o700 });
	for (const name of snapshotRoots) await mkdir(join(snapshot, name), { mode: 0o700 });
	for (const [path, content] of [
		["trellis/attachment", "retained attachment\n"],
		["trellis/page.html", "<h1>Retained Page</h1>"],
		["secrets/encryption.key", "synthetic-test-secret"],
		["workspaces/agent.patch", "retained dirty workspace bytes\n"],
		["conversations/session.json", '{"providerSessionId":"session-1"}'],
	])
		await writeFile(join(snapshot, path!), content!, { mode: 0o600 });
	return { root, snapshot, metadata, destination: join(root, "restored") };
}
