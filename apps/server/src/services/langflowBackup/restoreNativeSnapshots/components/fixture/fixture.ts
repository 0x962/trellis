import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import { protocolDigest } from "../../../../../langflowContracts";
import { withIsolatedRestore } from "../../../../../langflowHost/restoreExclusion";
import { manifestName, snapshotRoots } from "../../../manifest";
import { restorePairedSnapshot } from "../../../restorePairedSnapshot";
import { sealSnapshot } from "../../../sealSnapshot";
import { readRestoredNativeSnapshots } from "../../readRestoredNativeSnapshots";

export async function fixture(options: { historical?: boolean; unsafePath?: boolean; wrongBinding?: boolean } = {}) {
	const root = await mkdtemp(join(tmpdir(), "trellis-native-restore-"));
	const snapshot = join(root, "snapshot");
	const liveHome = join(root, "live");
	await mkdir(liveHome, { mode: 0o700 });
	await mkdir(snapshot, { mode: 0o700 });
	for (const name of snapshotRoots) await mkdir(join(snapshot, name), { mode: 0o700 });
	await mkdir(join(snapshot, "workspaces", "native-launches"), { mode: 0o700 });
	const rows = [1, 2].map((index) => {
		const binding = {
			executionId: "execution-1", stepId: `step-${index}`, agentRunId: `run-${index}`,
			attemptId: `00000000-0000-4000-8000-00000000000${index}`, requestDigest: protocolDigest(`request-${index}`),
		};
		const bytes = `${JSON.stringify({
			executionId: binding.executionId, stepId: binding.stepId, requestDigest: binding.requestDigest,
			launch: { run: { id: binding.agentRunId, instruction: "Original Ω prompt\nfull feedback" },
				attempt: { id: binding.attemptId, token: "synthetic-token" } },
		}, null, 2)}\n`;
		return { ...binding, bytes, digest: protocolDigest(bytes) };
	});
	const available = options.historical ? rows.slice(1) : rows;
	const files = available.map(({ bytes: _bytes, ...row }) => ({
		...row,
		sourcePath: `harness-attempts/${row.attemptId}/langflow-launch.json`,
		path: `workspaces/native-launches/${row.attemptId}.json`,
	}));
	for (const row of available) await writeFile(join(snapshot, "workspaces", "native-launches", `${row.attemptId}.json`), row.bytes, { mode: 0o600 });
	if (options.unsafePath) files[0]!.path = "../outside.json";
	if (options.wrongBinding) files[0]!.agentRunId = "foreign-run";
	const unavailable = options.historical ? [{
		executionId: rows[0]!.executionId, stepId: rows[0]!.stepId, agentRunId: rows[0]!.agentRunId,
		attemptId: rows[0]!.attemptId, requestDigest: rows[0]!.requestDigest, reason: "snapshot_not_recorded" as const,
	}] : [];
	const nativeInventory = { version: 1, ready: unavailable.length === 0, files, unavailable };
	const migrations = { sourceBytes: "[]", sourceDigest: protocolDigest("[]") };
	const factsBytes = JSON.stringify({ version: 1, tables: [{ name: "langflow_native_handles", rows: rows.map((row, index) => ({
		execution_id: row.executionId, step_id: row.stepId, agent_run_id: row.agentRunId,
		attempt_id: row.attemptId, request_digest: row.requestDigest,
		launch_snapshot_digest: options.historical && index === 0 ? null : row.digest,
	})) }] });
	const database = "synthetic-engine-database";
	const secret = "synthetic-engine-secret";
	const compatibility = {
		trellisRelease: "fixture", enginePackageDigest: "a".repeat(64),
		trellisDatabaseVersion: migrations.sourceDigest, engineDatabaseVersion: "revision-1", secretVersion: protocolDigest(secret),
	};
	const metadata = {
		snapshotId: crypto.randomUUID(), sourceDataHomeId: "captured-home", sourceHostId: "captured-host",
		createdAt: "2026-09-29T06:00:00.000Z", compatibility,
		boundary: { kind: "quiesced-export" as const, receiptId: "capture-boundary" },
		unavailable: unavailable.map((entry) => ({ reference: `native-launch:${entry.executionId}:${entry.stepId}:${entry.attemptId}`, reason: entry.reason })),
	};
	const engine = {
		version: 1, binding: { snapshotId: metadata.snapshotId, sourceDataHomeId: metadata.sourceDataHomeId,
			sourceHostId: metadata.sourceHostId, boundaryReceiptId: metadata.boundary.receiptId, compatibility },
		database: { sha256: protocolDigest(database), size: Buffer.byteLength(database) },
		secret: { sha256: protocolDigest(secret), size: Buffer.byteLength(secret) }, revisions: ["revision-1"], tables: [],
	};
	for (const [path, bytes] of [
		["engine/database.sqlite", database], ["secrets/engine-secret", secret], ["engine/receipt.json", JSON.stringify(engine)],
		["workspaces/native-launches/inventory.json", JSON.stringify(nativeInventory)],
		["workspaces/stop-reconciliation.json", "{}"],
		["workspaces/trellis-database-facts.json", JSON.stringify({ migrations, facts: { sourceBytes: factsBytes, sourceDigest: protocolDigest(factsBytes) } })],
	] as const) await writeFile(join(snapshot, path), bytes, { mode: 0o600 });
	const manifest = await sealSnapshot({ directory: snapshot, metadata });
	const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
	await writeFile(join(snapshot, manifestName), manifestBytes);
	const restored = await restorePairedSnapshot({ liveHome }, {
		snapshot, destination: join(root, "envelope"), targetHome: join(root, "target"),
		requestId: "isolated-native-restore", compatibility, signal: new AbortController().signal,
	});
	const input = { home: restored.targetHome, hostId: restored.identity.hostId, dataHomeId: restored.identity.dataHomeId,
		block: restored.block, signal: new AbortController().signal };
	const read = (receiptId: string) => withIsolatedRestore(input, () => withRuntimeMutationExclusion(input.home, [
		{ kind: "attempt-retention", directory: join(input.home, "harness-attempts") },
		...rows.map((row) => ({ kind: "attempt" as const, directory: join(input.home, "harness-attempts", row.attemptId) })),
	], () => readRestoredNativeSnapshots({ ...input, receiptId })));
	return { root, input, restored, rows, nativeInventory, manifestBytes, read };
}
