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
	const databaseFacts = await readReconciliationFacts(tx);
	if (
		ctx.version !== input.expectedVersion.trellisRelease ||
		databaseFacts.migrations.sourceDigest !== input.expectedVersion.trellisDatabaseVersion
	)
		throw new Error("paired_trellis_version_changed");
	const native = await exportNativeSnapshots(ctx, tx, input);
	const records = await readCaptureRecords(tx);
	if (history && !isDeepStrictEqual(history.records, records)) throw new Error("paired_retained_records_changed");
	const unavailable = [...native.unavailable, ...(history ? history.unavailable : uncapturedHistory(records))];
	const file = await open(join(input.directory, "conversations", "inventory.json"), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify({ version: 1, ...records }));
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
		await stopFile.writeFile(stops.sourceBytes);
		await stopFile.sync();
	} finally {
		await stopFile.close();
	}
	await syncDirectory(join(input.directory, "workspaces"));
	const factsFile = await open(join(input.directory, "workspaces", "trellis-database-facts.json"), "wx", 0o600);
	try {
		await factsFile.writeFile(JSON.stringify(databaseFacts));
		await factsFile.sync();
	} finally {
		await factsFile.close();
	}
	await syncDirectory(join(input.directory, "workspaces"));
	const taken = await snapshot(ctx, tx, {});
	return { staging: taken.staging, unavailable, native: native.manifest, version: input.expectedVersion };
}
