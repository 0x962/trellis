import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { ReconciliationFacts } from "../../../../db/queries/langflowExecution/reconciliationFacts";
import { protocolDigest } from "../../../../langflowContracts";
import type { readPairedSeal } from "../../../../services/langflowBackup/readPairedSeal";
import type { readNativeSnapshotManifest } from "../../../../services/langflowNative/readNativeSnapshotManifest";
import type { readStopReconciliation } from "../../../../services/langflowStops";
import type { LiveEngineIdentity } from "../../../engineReconciliation/schema/schema";
import type { readRestoredDatabaseOpen } from "../../../restoredDatabase";
import type { HostReconciliationInput } from "../../contracts";

const CapturedNativeSchema = z.object({
	ready: z.literal(true),
	unavailable: z.array(z.unknown()).length(0),
	files: z.array(
		z.object({
			executionId: z.string(),
			stepId: z.string(),
			agentRunId: z.string(),
			attemptId: z.string(),
			requestDigest: z.string(),
			digest: z.string(),
			path: z.string(),
			sourcePath: z.string(),
		}),
	),
});

type Seal = Awaited<ReturnType<typeof readPairedSeal>>;

type Proof = {
	input: HostReconciliationInput;
	trellisRelease: string;
	facts: ReconciliationFacts;
	engine: { record: { identity: LiveEngineIdentity } };
	native: Awaited<ReturnType<typeof readNativeSnapshotManifest>>;
	stops: Awaited<ReturnType<typeof readStopReconciliation>>;
	seal: (Pick<Seal, "block" | "manifest" | "manifestDigest" | "trellisFacts" | "engine"> & {
		sources: Pick<Seal["sources"], "nativeAttempts">;
	}) | null;
	opened: ReturnType<typeof readRestoredDatabaseOpen> | null;
};

export function compareRetainedProof(proof: Proof) {
	const { input, facts, engine, native, stops, seal, opened } = proof;
	for (const source of [facts.facts, facts.migrations]) {
		if (protocolDigest(source.sourceBytes) !== source.sourceDigest)
			throw new Error("host_reconciliation_facts_digest_conflict");
	}
	if (stops.unconfirmed.length) throw new Error("host_reconciliation_stops_pending");
	for (const row of stops.snapshot.records) {
		if (
			row.cancelIntent &&
			row.native.some((attempt) => !row.stops.some((stop) =>
				stop.state === "confirmed" && stop.stepId === attempt.stepId &&
				stop.agentRunId === attempt.agentRunId && stop.attemptId === attempt.attemptId,
			))
		) throw new Error("host_reconciliation_cancel_stop_missing");
	}
	if (input.block.reason.kind === "initialize") {
		if (seal !== null || opened !== null) throw new Error("host_reconciliation_initial_scope_conflict");
		return;
	}
	if (!seal || !isDeepStrictEqual(seal.block, input.block)) throw new Error("host_reconciliation_seal_missing");
	if (seal.manifest.unavailable.length) throw new Error("host_reconciliation_snapshot_unavailable");
	if (!isDeepStrictEqual(seal.trellisFacts, facts)) throw new Error("host_reconciliation_database_changed");
	const live = engine.record.identity;
	if (
		seal.manifest.compatibility.trellisRelease !== proof.trellisRelease ||
		seal.manifest.compatibility.enginePackageDigest !== input.enginePackageDigest ||
		seal.engine.database.sha256 !== live.database.contentSha256 ||
		seal.engine.database.size !== live.database.size ||
		!isDeepStrictEqual(seal.engine.revisions, live.database.alembicHeads) ||
		seal.engine.secret.sha256 !== live.secret.sha256 ||
		seal.manifest.compatibility.trellisDatabaseVersion !== facts.migrations.sourceDigest
	) throw new Error("host_reconciliation_paired_engine_conflict");
	const capturedNative = CapturedNativeSchema.parse(JSON.parse(seal.sources.nativeAttempts.sourceBytes));
	const files = capturedNative.files.map(({ path: _path, sourcePath, ...entry }) => ({ ...entry, path: sourcePath }));
	const ordered = <T extends { attemptId: string }>(values: T[]) =>
		values.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId));
	if (!native.ready || native.unavailable.length || !isDeepStrictEqual(ordered(files), ordered(native.files)))
		throw new Error("host_reconciliation_native_manifest_conflict");
	if (input.block.reason.kind === "restore") {
		if (
			!opened || opened.record.verified.bootId !== input.bootId ||
			!isDeepStrictEqual(opened.record.verified.block, input.block) ||
			opened.record.verified.manifestDigest !== seal.manifestDigest ||
			!isDeepStrictEqual(opened.record.evidence.migrations, facts.migrations) ||
			!isDeepStrictEqual(opened.record.evidence.facts, facts.facts)
		) throw new Error("host_reconciliation_restored_database_conflict");
		throw new Error("host_reconciliation_destination_components_unverified");
	}
}
