import { expect, test } from "bun:test";
import { protocolDigest } from "../../../../langflowContracts";
import { manifest } from "../../../fixtures/manifest";
import { compareRetainedProof } from "./compare";

type Proof = Parameters<typeof compareRetainedProof>[0];
const digest = "a".repeat(64);
const uuid = "10000000-0000-4000-8000-000000000001";
const at = "2026-09-29T00:00:00.000Z";
const source = (value: unknown) => {
	const sourceBytes = JSON.stringify(value);
	return { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
};

function fixture(): Proof {
	const facts = { migrations: source({ rows: [], version: 1 }), facts: source({ tables: [], version: 1 }) };
	const block: Proof["input"]["block"] = {
		id: uuid, dataHomeId: uuid, requestId: uuid, generation: 1,
		reason: { kind: "restore", directory: "/fixture/envelope", snapshotId: uuid, sourceDataHomeId: "source-home", manifestDigest: digest },
	};
	const compatibility = {
		trellisRelease: "fixture-release", enginePackageDigest: digest,
		trellisDatabaseVersion: facts.migrations.sourceDigest, engineDatabaseVersion: "head", secretVersion: digest,
	};
	const identity = { dataHomeId: uuid, hostId: uuid, ownerId: uuid, instanceId: uuid, manifestDigest: digest };
	const opened = {
		version: 1 as const,
		verified: {
			version: 1 as const, installReceiptId: digest,
			identity: { version: 1 as const, home: "/fixture/home", hostId: uuid, dataHomeId: uuid },
			block, dataDir: "/fixture/home/db", bootId: uuid, snapshotId: uuid,
			manifestDigest: digest, sourceDataHomeId: "source-home", inventoryDigest: digest,
		},
		evidence: { dataDir: "/fixture/home/db", bootId: uuid, ...facts },
	};
	return {
		input: {
			operation: "prepare", block, bootId: uuid, manifest,
			enginePackageDigest: digest, engineConfigSha256: digest,
			observation: { id: uuid, identity, observedAt: at, endpoint: "http://127.0.0.1:7860" },
			openedDatabaseReceiptId: digest, receiptId: null,
		},
		trellisRelease: compatibility.trellisRelease,
		facts: structuredClone(facts),
		engine: { record: { identity: {
			runtime: identity,
			package: { enginePackageDigest: digest, componentManifestHash: digest, engineCommit: "a".repeat(40), engineConfigSha256: digest },
			database: { path: "/data/config/langflow.db", contentSha256: digest, size: 4096, alembicHeads: ["head"] },
			secret: { sha256: digest },
		} } },
		native: { ready: true, files: [], unavailable: [] },
		stops: {
			receiptId: digest, sourceBytes: "{}", unconfirmed: [],
			snapshot: { version: 1, dataHomeId: uuid, blockId: uuid, generation: 1, records: [] },
		},
		seal: {
			block, manifestDigest: digest, trellisFacts: structuredClone(facts),
			manifest: {
				version: 1, capability: "langflow-paired-v1", snapshotId: uuid,
				sourceDataHomeId: "source-home", sourceHostId: "source-host", createdAt: at,
				compatibility, boundary: { kind: "quiesced-export", receiptId: digest },
				unavailable: [], files: [], directories: [],
			},
			engine: {
				version: 1,
				binding: { snapshotId: uuid, sourceDataHomeId: "source-home", sourceHostId: "source-host", boundaryReceiptId: digest, compatibility },
				database: { sha256: digest, size: 4096 }, secret: { sha256: digest, size: 64 },
				revisions: ["head"], tables: ["job"],
			},
			sources: { nativeAttempts: source({ ready: true, unavailable: [], files: [] }) },
		},
		opened: { record: opened, ...source(opened) },
	};
}

test("restore comparison requires matching captured, opened, and current source bytes", () => {
	const proof = fixture();
	expect(() => compareRetainedProof(proof)).not.toThrow();
	proof.facts.facts = source({ tables: [{ name: "clock", rows: [{ deadline: "changed" }] }], version: 1 });
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_database_changed");
});

test("a matching capture cannot replace the actual opened database receipt", () => {
	const proof = fixture();
	proof.opened = null;
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_restored_database_conflict");
});

test("open evidence from a different boot or different facts refuses release", () => {
	const boot = fixture();
	boot.opened!.record.verified.bootId = "another-boot";
	expect(() => compareRetainedProof(boot)).toThrow("host_reconciliation_restored_database_conflict");
	const changed = fixture();
	changed.opened!.record.evidence.facts = source({ tables: [], version: 2 });
	expect(() => compareRetainedProof(changed)).toThrow("host_reconciliation_restored_database_conflict");
});

test("migration bytes and engine database identity must match the capture", () => {
	const migrations = fixture();
	migrations.facts.migrations = source({ rows: [{ id: "2", hash: digest, created_at: "1" }], version: 1 });
	expect(() => compareRetainedProof(migrations)).toThrow("host_reconciliation_database_changed");
	const engine = fixture();
	engine.engine.record.identity.database.contentSha256 = "b".repeat(64);
	expect(() => compareRetainedProof(engine)).toThrow("host_reconciliation_paired_engine_conflict");
	const secret = fixture();
	secret.engine.record.identity.secret.sha256 = "b".repeat(64);
	expect(() => compareRetainedProof(secret)).toThrow("host_reconciliation_paired_engine_conflict");
});

test("unavailable workspace and conversation exports refuse release", () => {
	for (const reference of ["workspace", "conversation"]) {
		const proof = fixture();
		proof.seal!.manifest.unavailable.push({ reference, reason: "export_unavailable" });
		expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_snapshot_unavailable");
	}
});

test("a canceled exact native attempt needs its own confirmed stop", () => {
	const proof = fixture();
	proof.stops.snapshot.records.push({
		executionId: "execution", cancelIntent: {
			version: 1, executionId: "execution", requestId: uuid,
			actor: { kind: "human", name: "fixture" }, expectedRevision: 1, requestedAt: at,
		},
		stops: [], deadlines: [], native: [{
			stepId: "step", agentRunId: "run", attemptId: uuid,
			state: "running", revision: 1, launchReceipt: null, deadlineRefs: [],
		}],
	});
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_cancel_stop_missing");
});

test("unknown stop evidence cannot release the gate", () => {
	const proof = fixture();
	proof.stops.unconfirmed.push({
		version: 1, obligationId: "stop", executionId: "execution", stepId: "step",
		agentRunId: "run", attemptId: uuid, reason: "deadline", requestedAt: at,
		revision: 1, state: "ownership_unknown", exitReceipt: null,
	});
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_stops_pending");
});

test("a changed native launch snapshot refuses release", () => {
	const proof = fixture();
	proof.native.files.push({
		executionId: "execution", stepId: "step", agentRunId: "run", attemptId: uuid,
		requestDigest: digest, digest, path: `harness-attempts/${uuid}/langflow-launch.json`,
	});
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_native_manifest_conflict");
});

test("a different Trellis release cannot reuse the capture compatibility", () => {
	const proof = fixture();
	proof.trellisRelease = "different-release";
	expect(() => compareRetainedProof(proof)).toThrow("host_reconciliation_paired_engine_conflict");
});
