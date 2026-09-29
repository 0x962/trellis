import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../langflowContracts";
import type { LiveOwnership } from "../contracts";
import { LangflowHostControl } from "../hostControl";
import { provisionReconciliationIssuer } from "./credential";
import { EngineReconciliation } from "./engineReconciliation";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-engine-reconciliation-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	const control = LangflowHostControl.create({
		home,
		evidence: {
			readTerminal: async () => {
				throw new Error("unexpected_terminal");
			},
			withReconciliation: async (block, id, commit) =>
				commit({
					id,
					block,
					packageDigest: "a".repeat(64),
					trellisDatabaseReceiptId: "db",
					engineDatabaseReceiptId: "engine",
					secretReceiptId: "secret",
					ownershipReceiptId: "owner",
					nativeAttemptsReceiptId: "native",
					stopObligationsReceiptId: "stops",
					snapshotSealReceiptId: null,
				}),
		},
	});
	const block = control.gate.read().block!;
	const observation: LiveOwnership = {
		id: crypto.randomUUID(),
		observedAt: "2026-09-29T12:00:00.000Z",
		endpoint: "http://127.0.0.1:7860",
		identity: {
			dataHomeId: control.identity.dataHomeId,
			hostId: control.identity.hostId,
			ownerId: crypto.randomUUID(),
			instanceId: crypto.randomUUID(),
			manifestDigest: "a".repeat(64),
		},
	};
	const live = {
		runtime: observation.identity,
		package: {
			enginePackageDigest: "a".repeat(64),
			componentManifestHash: "b".repeat(64),
			engineCommit: "c".repeat(40),
			engineConfigSha256: "d".repeat(64),
		},
		database: { path: "/data/config/langflow.db", contentSha256: "e".repeat(64), size: 42, alembicHeads: ["head"] },
		secret: { sha256: "f".repeat(64) },
	};
	provisionReconciliationIssuer(control.identity);
	const requests: { url: string; body: string | undefined }[] = [];
	let unknown = false;
	let savedLease = "";
	const make = () =>
		new EngineReconciliation({
			control,
			supervisor: { withHealthyEngine: async (operation) => operation(observation) },
			dependencies: {
				readAuthenticationFile: async () => "engine-token",
				fetch: async (url, init) => {
					const path = new URL(String(url)).pathname;
					const body = typeof init?.body === "string" ? init.body : undefined;
					requests.push({ url: path, body });
					expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer engine-token");
					expect(new Headers(init?.headers).get("X-Trellis-Reconciliation-Issuer")).toMatch(/^[a-f0-9]{64}$/);
					if (unknown) {
						unknown = false;
						throw new Error("lost_response");
					}
					if (path.endsWith("/identity")) return Response.json(live);
					const input = body ? JSON.parse(body) : null;
					if (input?.leaseBytes) savedLease = input.leaseBytes;
					const state = path.endsWith("/release") ? "released" : "active";
					const acknowledgementBytes = input?.acknowledgementBytes ?? null;
					const identityBytes = JSON.stringify(live);
					return Response.json({
						leaseBytes: savedLease,
						leaseDigest: protocolDigest(savedLease),
						state,
						identity: live,
						identityBytes,
						identityDigest: protocolDigest(identityBytes),
						acknowledgementBytes,
						receiptId: protocolDigest(
							JSON.stringify({ leaseBytes: savedLease, state, identityBytes, acknowledgementBytes }),
						),
					});
				},
			},
		});
	return {
		control,
		block,
		observation,
		requests,
		make,
		loseResponse: () => {
			unknown = true;
		},
	};
}

test("unknown acquisition retains exact lease bytes across a reopened client", async () => {
	const f = fixture();
	f.loseResponse();
	const signal = new AbortController().signal;
	expect(await f.make().acquire(f.block, signal)).toBeNull();
	const resumed = await f.make().acquire(f.block, signal);
	expect(resumed?.record.state).toBe("active");
	expect(f.requests[0]?.body).toBe(f.requests[1]?.body);
	expect(f.control.gate.read().block).toEqual(f.block);
	expect((await f.make().read(f.block, signal))?.record.identity.runtime).toEqual(f.observation.identity);
});

test("a current gate receipt is required before engine release", async () => {
	const f = fixture();
	const client = f.make();
	const signal = new AbortController().signal;
	await client.acquire(f.block, signal);
	await expect(client.release(f.block, "release", signal)).rejects.toThrow("engine_reconciliation_gate_not_released");
	await f.control.gate.reconcile(f.block, "release");
	f.loseResponse();
	expect(await client.release(f.block, "release", signal)).toBeNull();
	expect((await f.make().release(f.block, "release", signal))?.record.state).toBe("released");
	expect(f.requests.at(-1)?.body).toBe(f.requests.at(-2)?.body);
});

test("a saved lease cannot move to another engine instance", async () => {
	const f = fixture();
	const signal = new AbortController().signal;
	await f.make().acquire(f.block, signal);
	f.observation.identity = { ...f.observation.identity, instanceId: crypto.randomUUID() };
	await expect(f.make().read(f.block, signal)).rejects.toThrow("engine_reconciliation_instance_changed");
	expect(f.requests).toHaveLength(1);
});
