import { open } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readReconciliationFacts } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { readStopReconciliation } from "../../langflowStops";
import type { IoCtx } from "../../support";
import { snapshot } from "../../system";
import type { CapturedHistory } from "../captureHistoryContracts";
import { exportNativeSnapshots } from "../nativeSnapshots";
import type { TrellisCaptureInput, TrellisCaptureResult } from "../pairedContracts";
import { readCaptureRecords } from "../readCaptureRecords";
import { syncDirectory } from "../syncDirectory";
import { uncapturedHistory } from "../uncapturedHistory";

export async function captureTrellisSnapshot(
	ctx: IoCtx,
	tx: Tx,
	input: TrellisCaptureInput,
	history?: CapturedHistory,
): Promise<TrellisCaptureResult> {
	const signal = history?.signal;
	signal?.throwIfAborted();
	const databaseFacts = await readReconciliationFacts(tx);
	signal?.throwIfAborted();
	if (
		ctx.version !== input.expectedVersion.trellisRelease ||
		databaseFacts.migrations.sourceDigest !== input.expectedVersion.trellisDatabaseVersion
	)
		throw new Error("paired_trellis_version_changed");
	const native = await exportNativeSnapshots(ctx, tx, { ...input, signal });
	const records = await readCaptureRecords(tx);
	signal?.throwIfAborted();
	if (history && !isDeepStrictEqual(history.records, records)) throw new Error("paired_retained_records_changed");
	const unavailable = [...native.unavailable, ...(history ? history.unavailable : uncapturedHistory(records))];
	const file = await open(join(input.directory, "conversations", "inventory.json"), "wx", 0o600);
	try {
		signal?.throwIfAborted();
		await file.writeFile(JSON.stringify({ version: 1, ...records }), { signal });
		await file.sync();
	} finally {
		await file.close();
	}
	await syncDirectory(join(input.directory, "conversations"));
	const stops = await readStopReconciliation(ctx.core, tx, {
		dataHomeId: input.block.dataHomeId,
		blockId: input.block.id,
		generation: input.block.generation,
	});
	const stopFile = await open(join(input.directory, "workspaces", "stop-reconciliation.json"), "wx", 0o600);
	try {
		signal?.throwIfAborted();
		await stopFile.writeFile(stops.sourceBytes, { signal });
		await stopFile.sync();
	} finally {
		await stopFile.close();
	}
	await syncDirectory(join(input.directory, "workspaces"));
	const factsFile = await open(join(input.directory, "workspaces", "trellis-database-facts.json"), "wx", 0o600);
	try {
		signal?.throwIfAborted();
		await factsFile.writeFile(JSON.stringify(databaseFacts), { signal });
		await factsFile.sync();
	} finally {
		await factsFile.close();
	}
	await syncDirectory(join(input.directory, "workspaces"));
	signal?.throwIfAborted();
	const taken = await snapshot(ctx, tx, {});
	signal?.throwIfAborted();
	return { staging: taken.staging, unavailable, native: native.manifest, version: input.expectedVersion };
}
