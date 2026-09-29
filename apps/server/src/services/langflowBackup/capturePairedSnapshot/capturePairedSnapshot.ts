import { chmod, mkdir, readFile, realpath, rename } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../langflowContracts";
import { LangflowHostControl } from "../../../langflowHost";
import { CaptureGrantSchema } from "../../../langflowHost/captureAuthority/schema/schema";
import { captureSnapshot } from "../captureSnapshot";
import { exportEngineSnapshot } from "../engineSnapshot";
import { manifestName, type SnapshotMetadata } from "../manifest/manifest";
import type { PairedCaptureContext, PairedCaptureInput } from "../pairedContracts";
import { PairedJournal } from "../pairedJournal";
import { readEngineCompatibility } from "../readEngineCompatibility";
import { syncDirectory } from "../syncDirectory";
import { syncSnapshotTree } from "../syncSnapshotTree";

export async function capturePairedSnapshot(ctx: PairedCaptureContext, input: PairedCaptureInput) {
	const directory = join(await realpath(dirname(input.directory)), basename(input.directory));
	const controlDirectory = LangflowHostControl.directory(ctx.control.identity.home);
	if (directory === controlDirectory || directory.startsWith(`${controlDirectory}${sep}`))
		throw new Error("paired_export_inside_control");
	const trellisVersion = await ctx.readTrellisVersion();
	const observed = await ctx.supervisor.withHealthyEngine(async (engine) => ({
		engine,
		compatibility: await readEngineCompatibility({
			endpoint: engine.endpoint,
			authenticationFile: ctx.authenticationFile,
			signal: input.signal,
		}),
	}));
	const { sourceHostId, sourceDataHomeId, enginePackageDigest, engineDatabaseVersion, secretVersion } = observed.compatibility;
	if (sourceHostId !== ctx.control.identity.hostId || sourceDataHomeId !== ctx.control.identity.dataHomeId ||
		sourceHostId !== observed.engine.identity.hostId || sourceDataHomeId !== observed.engine.identity.dataHomeId)
		throw new Error("paired_source_identity_mismatch");
	const compatibility = { ...trellisVersion, enginePackageDigest, engineDatabaseVersion, secretVersion };
	const journal = await PairedJournal.create(ctx.control, {
		version: 1, kind: "capture", snapshotId: input.snapshotId, requestId: input.requestId, directory,
		dataHomeId: sourceDataHomeId, hostId: sourceHostId, compatibility, createdAt: new Date().toISOString(),
	});
	const block = ctx.control.gate.closeDispatch({
		requestId: input.requestId, reason: { kind: "capture", snapshotId: input.snapshotId },
	});
	await journal.write("block", block);
	await ctx.control.gate.waitForDrain(block, input.signal);
	const state = ctx.control.gate.read();
	if (!isDeepStrictEqual(state.block, block) || state.permits.some((entry) => entry.terminal === null))
		throw new Error("paired_capture_not_drained");
	const boundaryReceiptId = protocolDigest(JSON.stringify({ block, permits: state.permits }));
	const issued = await ctx.authority.issue({ block, boundaryReceiptId });
	await journal.write("grant", issued);
	const grant = CaptureGrantSchema.parse(JSON.parse(issued.grantBytes));
	if (!isDeepStrictEqual(grant.identity, observed.engine.identity)) throw new Error("paired_engine_changed");
	const active = await ctx.authority.commit(issued.grantBytes, input.signal);
	if (active.state !== "active") throw new Error("paired_capture_not_active");
	await journal.write("active", active);
	const metadata: SnapshotMetadata = {
		snapshotId: input.snapshotId, sourceDataHomeId, sourceHostId, createdAt: new Date().toISOString(),
		compatibility, boundary: { kind: "quiesced-export", receiptId: boundaryReceiptId }, unavailable: [],
	};
	const captured = await captureSnapshot({
		withQuiescedSnapshot: (consume) => ctx.supervisor.withHealthyEngine(async (engine) => {
			if (!isDeepStrictEqual(engine.identity, grant.identity)) throw new Error("paired_engine_changed");
			await mkdir(directory, { mode: 0o700 });
			for (const root of ["engine", "secrets", "workspaces", "conversations"])
				await mkdir(join(directory, root), { mode: 0o700 });
			await syncDirectory(dirname(directory));
			await journal.write("exporting", { metadata, identity: engine.identity });
			const receipt = await exportEngineSnapshot({
				endpoint: engine.endpoint, authenticationFile: ctx.authenticationFile, directory, metadata, signal: input.signal,
			});
			await journal.write("engine", receipt);
			const trellis = await ctx.captureTrellis({ directory, expectedVersion: trellisVersion, block });
			await journal.write("trellis", trellis);
			await chmod(trellis.staging, 0o700);
			await syncSnapshotTree(trellis.staging);
			await rename(trellis.staging, join(directory, "trellis"));
			await syncDirectory(dirname(trellis.staging));
			await syncDirectory(directory);
			metadata.unavailable.push(...trellis.unavailable);
			return consume({ directory, metadata });
		}),
	});
	const manifestDigest = protocolDigest(await readFile(join(directory, manifestName), "utf8"));
	await journal.write("sealed", { manifest: captured.manifest, manifestDigest });
	await journal.write("revoking", { grantBytes: issued.grantBytes });
	const revoked = await ctx.authority.revoke(issued.grantBytes, input.signal);
	if (revoked.state !== "revoked") throw new Error("paired_capture_revocation_unknown");
	await journal.write("revoked", revoked);
	return { ...captured, manifestDigest, block, state: "requires-reconciliation" as const };
}
