import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../../langflowContracts";
import { provisionReconciliationIssuer } from "../../../engineReconciliation/credential/credential";
import { readReconciliationIssuer } from "../../../engineReconciliation/credential/credential";
import { manifest } from "../../../fixtures/manifest";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";
import { PrivateState } from "../../../privateState";
import type { HostReconciliationInput } from "../../contracts";
import { readHeldEngine } from "./engine";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-held-engine-")));
	roots.push(root);
	const home = join(root, "home");
	await mkdir(home, { mode: 0o700 });
	const initialized = LangflowHostControl.initialize({
		home, initialBlock: { requestId: crypto.randomUUID(), reason: { kind: "initialize" } },
	});
	const block = initialized.block;
	if (!block) throw new Error("fixture_block_missing");
	const boundManifest = structuredClone(manifest);
	boundManifest.data.dataHomeId = initialized.identity.dataHomeId;
	boundManifest.epochOwnership.dataHomeId = initialized.identity.dataHomeId;
	const identity = {
		dataHomeId: initialized.identity.dataHomeId,
		hostId: initialized.identity.hostId,
		ownerId: crypto.randomUUID(), instanceId: crypto.randomUUID(),
		manifestDigest: protocolDigest(JSON.stringify(boundManifest)),
	};
	const privateState = await PrivateState.open(home);
	await privateState.reserve(identity);
	provisionReconciliationIssuer(initialized.identity);
	const input: HostReconciliationInput = {
		operation: "prepare", block, bootId: crypto.randomUUID(), manifest: boundManifest,
		enginePackageDigest: "b".repeat(64), engineConfigSha256: "c".repeat(64),
		observation: { id: crypto.randomUUID(), identity, observedAt: "2026-09-29T00:00:00.000Z", endpoint: "http://127.0.0.1:7860" },
		openedDatabaseReceiptId: null, receiptId: null,
	};
	const leaseBytes = JSON.stringify({
		version: 1, id: crypto.randomUUID(), identity,
		block: { id: block.id, dataHomeId: block.dataHomeId, generation: block.generation, requestId: block.requestId },
		issuerDigest: protocolDigest(readReconciliationIssuer(initialized.identity)),
	});
	const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(home), "engine-reconciliation"));
	objects.bind(JSON.stringify([block.dataHomeId, block.id, block.generation, block.requestId]), objects.write(leaseBytes));
	const live = {
		runtime: identity,
		package: {
			enginePackageDigest: input.enginePackageDigest,
			componentManifestHash: boundManifest.components.catalog.sha256,
			engineCommit: boundManifest.source.commit,
			engineConfigSha256: input.engineConfigSha256,
		},
		database: { path: "/data/config/langflow.db", contentSha256: "d".repeat(64), size: 4096, alembicHeads: ["head"] },
		secret: { sha256: "e".repeat(64) },
	};
	const authority = DeliveryAuthorityV1Schema.parse({
		version: 1, executionId: "execution", publicationId: "publication", engineJobId: crypto.randomUUID(),
		engineEpoch: 1, hostId: identity.hostId, ownerId: identity.ownerId, projectId: "project",
		publicationDigest: "a".repeat(64), ownershipRevision: 1, capabilityId: "capability",
		permissions: ["native.read"], issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
	});
	const authorityBytes = JSON.stringify(authority, null, 2);
	let missingAuthority = false;
	let empty = true;
	let state = "active";
	let unknown = false;
	let corrupt = false;
	const calls: string[] = [];
	const dependencies = {
		fetch: async (url: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(url)).pathname;
			calls.push(path);
			expect(init?.method).toBe("GET");
			expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer .+/);
			expect(new Headers(init?.headers).get("X-Trellis-Reconciliation-Issuer")).toMatch(/^[a-f0-9]{64}$/);
			if (unknown) throw new Error("lost_response");
			if (path.endsWith("/identity")) return Response.json(live);
			if (path.endsWith("/empty")) return Response.json({ empty });
			if (path.includes("/authorities/")) {
				if (missingAuthority) return new Response(null, { status: 404 });
				return Response.json({ authorityBytes, authorityDigest: protocolDigest(authorityBytes), authority: { ...authority, issuedAt: "2026-09-29T00:00:00Z", expiresAt: "2026-09-30T00:00:00Z" }, revokedAt: null });
			}
			const identityBytes = JSON.stringify(live);
			const acknowledgementBytes = state === "active" ? null : "ack";
			return Response.json({
				leaseBytes, leaseDigest: protocolDigest(leaseBytes), state, identity: live,
				identityBytes, identityDigest: protocolDigest(identityBytes), acknowledgementBytes,
				receiptId: corrupt ? "0".repeat(64) : protocolDigest(JSON.stringify({ leaseBytes, state, identityBytes, acknowledgementBytes })),
			});
		},
	};
	return {
		home, input, live, dependencies, calls, identity, authorityBytes,
		missAuthority: () => { missingAuthority = true; },
		retainJob: () => { empty = false; },
		release: () => { state = "released"; },
		lose: () => { unknown = true; },
		corrupt: () => { corrupt = true; },
	};
}

const signal = () => new AbortController().signal;

test("held engine proof reads the actual lease and current identity with both credentials", async () => {
	const f = await fixture();
	const proof = await readHeldEngine(f.home, f.input, signal(), f.dependencies);
	expect(proof.record.identity).toEqual(f.live);
	expect(f.calls).toHaveLength(2);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("a released lease cannot supply writer exclusion", async () => {
	const f = await fixture();
	f.release();
	await expect(readHeldEngine(f.home, f.input, signal(), f.dependencies)).rejects.toThrow("host_reconciliation_engine_not_excluded");
	expect(f.calls).toHaveLength(1);
});

test("unknown reads and corrupt receipts never supply proof", async () => {
	const lost = await fixture();
	lost.lose();
	await expect(readHeldEngine(lost.home, lost.input, signal(), lost.dependencies)).rejects.toThrow("host_reconciliation_engine_unknown");
	const corrupt = await fixture();
	corrupt.corrupt();
	await expect(readHeldEngine(corrupt.home, corrupt.input, signal(), corrupt.dependencies)).rejects.toThrow("engine_reconciliation_receipt_conflict");
});

test("a changed package fails despite a valid lease receipt", async () => {
	const f = await fixture();
	f.live.package.enginePackageDigest = "f".repeat(64);
	await expect(readHeldEngine(f.home, f.input, signal(), f.dependencies)).rejects.toThrow("host_reconciliation_engine_facts_conflict");
});

test("a replaced local instance prevents any engine request", async () => {
	const f = await fixture();
	await writeFile(join(f.home, "langflow/supervisor/process.json"), JSON.stringify({ ...f.identity, instanceId: crypto.randomUUID() }), { mode: 0o600 });
	await expect(readHeldEngine(f.home, f.input, signal(), f.dependencies)).rejects.toThrow("host_reconciliation_instance_changed");
	expect(f.calls).toEqual([]);
});


test("authority reads use the held lease and retain original grant text", async () => {
	const f = await fixture();
	const proof = await readHeldEngine(f.home, f.input, signal(), f.dependencies);
	const saved = await proof.readAuthority("execution");
	expect(saved.authorityBytes).toBe(f.authorityBytes);
	expect(f.calls[2]).toMatch(/^\/trellis-v1\/reconciliation-leases\/[^/]+\/authorities\/execution$/);
});

test("an absent engine authority cannot prove a live owner", async () => {
	const f = await fixture();
	f.missAuthority();
	const proof = await readHeldEngine(f.home, f.input, signal(), f.dependencies);
	await expect(proof.readAuthority("execution")).rejects.toThrow("host_reconciliation_engine_unknown");
});


test("initialization reads actual emptiness under the current lease", async () => {
	const f = await fixture();
	const proof = await readHeldEngine(f.home, f.input, signal(), f.dependencies);
	expect((await proof.readEmpty()).empty).toBe(true);
	f.retainJob();
	expect((await proof.readEmpty()).empty).toBe(false);
	expect(f.calls[2]).toMatch(/\/reconciliation-leases\/[^/]+\/empty$/);
});
