import { open } from "node:fs/promises";
import { join } from "node:path";
import { asc } from "drizzle-orm";
import { readReconciliationFacts } from "../../../db/queries/langflowExecution";
import { agentRuns } from "../../../db/tables/agentRuns";
import type { Tx } from "../../../db/tx";
import { readStopReconciliation } from "../../langflowStops";
import { prepareSystemSnapshot } from "../../prepareSystemSnapshot";
import type { IoCtx } from "../../support";
import { exportNativeSnapshots } from "../nativeSnapshots";
import type { TrellisCaptureInput, TrellisCaptureResult } from "../pairedContracts";
import { syncDirectory } from "../syncDirectory";

export async function captureTrellisSnapshot(ctx: IoCtx, input: TrellisCaptureInput): Promise<TrellisCaptureResult> {
	const taken = await prepareSystemSnapshot(ctx, (tx) => captureState(ctx, tx, input));
	return { staging: taken.staging, ...taken.value };
}

async function captureState(ctx: IoCtx, tx: Tx, input: TrellisCaptureInput) {
	const databaseFacts = await readReconciliationFacts(tx);
	if (
		ctx.version !== input.expectedVersion.trellisRelease ||
		databaseFacts.migrations.sourceDigest !== input.expectedVersion.trellisDatabaseVersion
	)
		throw new Error("paired_trellis_version_changed");
	const native = await exportNativeSnapshots(ctx, tx, input);
	const runs = await tx
		.select({
			agentRunId: agentRuns.id,
			attemptId: agentRuns.terminalId,
			workspaceId: agentRuns.workspaceId,
			providerSessionId: agentRuns.sessionId,
			sessionLost: agentRuns.sessionLost,
		})
		.from(agentRuns)
		.orderBy(asc(agentRuns.id));
	const unavailable = [...native.unavailable];
	for (const run of runs) {
		if (run.workspaceId)
			unavailable.push({
				reference: `workspace:${run.agentRunId}`,
				reason: "A consistent self-contained workspace exporter is unavailable; the database retains its identity.",
			});
		if (run.providerSessionId || run.sessionLost)
			unavailable.push({
				reference: `conversation:${run.agentRunId}`,
				reason: "A consistent provider conversation exporter is unavailable; the database retains its identity.",
			});
	}
	const file = await open(join(input.directory, "conversations", "inventory.json"), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify({ version: 1, runs }));
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
	return { unavailable, native: native.manifest, version: input.expectedVersion };
}
