import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { HostControlIdentity, DispatchBlock } from "../../../../../langflowHost";
import { protocolDigest } from "../../../../../langflowContracts";
import { PairedJournal } from "../../../pairedJournal";
import { readPairedSeal } from "../../../readPairedSeal";
import { FactsSchema, NativeFactSchema, NativeInventorySchema, RestoredStageSchema } from "../schema";

export async function readRestoreSource(identity: HostControlIdentity, block: DispatchBlock) {
	if (block.reason.kind !== "restore") throw new Error("native_restore_block_conflict");
	const seal = await readPairedSeal({ control: { identity } }, { snapshotId: block.reason.snapshotId });
	const journal = await PairedJournal.open({ identity }, block.reason.snapshotId);
	const restored = RestoredStageSchema.parse(await journal.read("restored"));
	if (seal.request.kind !== "restore" || seal.request.requestId !== block.requestId ||
		!isDeepStrictEqual(seal.block, block) || !isDeepStrictEqual(restored, {
			payload: join(block.reason.directory, "payload"),
			manifestDigest: block.reason.manifestDigest,
			targetHome: identity.home,
		})) throw new Error("native_restore_journal_conflict");
	const inventory = NativeInventorySchema.parse(JSON.parse(seal.sources.nativeAttempts.sourceBytes));
	const inventoryFile = seal.manifest.files.find((entry) => entry.path === "workspaces/native-launches/inventory.json");
	if (!inventoryFile || inventoryFile.sha256 !== seal.sources.nativeAttempts.sourceDigest ||
		inventoryFile.executable || inventory.ready !== (inventory.unavailable.length === 0))
		throw new Error("native_restore_inventory_conflict");
	const tables = FactsSchema.parse(JSON.parse(seal.trellisFacts.facts.sourceBytes)).tables;
	const nativeTables = tables.filter((table) => table.name === "langflow_native_handles");
	if (nativeTables.length !== 1) throw new Error("native_restore_facts_missing");
	const facts = nativeTables[0]!.rows.map((row) => NativeFactSchema.parse(row));
	const entries = [...inventory.files, ...inventory.unavailable];
	if (new Set(entries.map((entry) => entry.attemptId)).size !== entries.length || facts.length !== entries.length ||
		new Set(facts.map((row) => row.attempt_id)).size !== facts.length)
		throw new Error("native_restore_binding_conflict");
	for (const entry of entries) {
		const row = facts.find((value) => value.attempt_id === entry.attemptId);
		if (!row || row.execution_id !== entry.executionId || row.step_id !== entry.stepId ||
			row.agent_run_id !== entry.agentRunId || row.request_digest !== entry.requestDigest ||
			("digest" in entry && row.launch_snapshot_digest !== entry.digest) ||
			("reason" in entry && (entry.reason === "snapshot_not_recorded") !== (row.launch_snapshot_digest === null)))
			throw new Error("native_restore_binding_conflict");
	}
	const paths = new Set(["workspaces/native-launches/inventory.json"]);
	for (const entry of inventory.files) {
		if (entry.path !== `workspaces/native-launches/${entry.attemptId}.json`)
			throw new Error("native_restore_path_unsafe");
		const file = seal.manifest.files.find((value) => value.path === entry.path);
		if (!file || file.sha256 !== entry.digest || file.executable) throw new Error("native_restore_file_conflict");
		paths.add(entry.path);
	}
	if (seal.manifest.files.some((entry) => entry.path.startsWith("workspaces/native-launches/") && !paths.has(entry.path)))
		throw new Error("native_restore_unbound_file");
	return {
		seal,
		inventory,
		intent: {
			version: 1 as const,
			kind: "native-snapshot-install" as const,
			identity,
			block,
			capture: {
				snapshotId: seal.manifest.snapshotId,
				sourceHostId: seal.manifest.sourceHostId,
				sourceDataHomeId: seal.manifest.sourceDataHomeId,
				manifest: seal.sources.snapshotSeal,
				nativeInventory: seal.sources.nativeAttempts,
				factsDigest: protocolDigest(seal.trellisFacts.facts.sourceBytes),
			},
		},
	};
}
