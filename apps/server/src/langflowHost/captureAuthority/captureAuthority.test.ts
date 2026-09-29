import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../langflowContracts";
import type { SidecarIdentity } from "../contracts";
import type { DispatchEvidence } from "../dispatchGate";
import type { EngineClientOptions } from "../engineClient";
import { LangflowHostControl } from "../hostControl";
import type { LangflowSupervisor } from "../supervisor";
import { CaptureAuthority } from "./captureAuthority";
import { provisionCaptureIssuer } from "./credential/credential";
import type { CaptureReceipt } from "./schema/schema";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-capture-authority-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	const evidence: DispatchEvidence = {
		async readTerminal() {
			throw new Error("terminal_unknown");
		},
		async withReconciliation(block, id, commit) {
			commit({
				id,
				block,
				packageDigest: "a".repeat(64),
				trellisDatabaseReceiptId: "db",
				engineDatabaseReceiptId: "engine",
				secretReceiptId: "secret",
				ownershipReceiptId: "owner",
				nativeAttemptsReceiptId: "attempts",
				stopObligationsReceiptId: "stops",
				snapshotSealReceiptId: "seal",
			});
		},
	};
	const control = LangflowHostControl.create({ home, evidence });
	const initial = control.gate.read().block;
	if (!initial) throw new Error("initial_block_missing");
	await control.gate.reconcile(initial, "initial");
	const identity: SidecarIdentity = {
		dataHomeId: control.identity.dataHomeId,
		hostId: control.identity.hostId,
		ownerId: crypto.randomUUID(),
		instanceId: crypto.randomUUID(),
		manifestDigest: "a".repeat(64),
	};
	const supervisor: Pick<LangflowSupervisor, "withHealthyEngine"> = {
		async withHealthyEngine(operation) {
			return operation({
				id: crypto.randomUUID(),
				identity,
				observedAt: new Date().toISOString(),
				endpoint: "http://127.0.0.1:7860",
			});
		},
	};
	const credentialPath = provisionCaptureIssuer(control.identity);
	const key = readFileSync(credentialPath, "utf8");
	const remote = { receipt: null as CaptureReceipt | null, loseRevoke: false, corrupt: false };
	const transport: Omit<EngineClientOptions, "endpoint"> = {
		authenticationFile: "fixture",
		dependencies: {
			readAuthenticationFile: async () => "fixture-bearer",
			fetch: async (url, init) => {
				const headers = new Headers(init?.headers);
				expect(headers.get("Authorization")).toBe("Bearer fixture-bearer");
				expect(headers.get("X-Trellis-Capture-Issuer")).toBe(key);
				const revoke = String(url).endsWith("/revoke");
				if (init?.method === "POST") {
					const { grantBytes } = JSON.parse(String(init.body));
					const state = revoke || remote.receipt?.state === "revoked" ? "revoked" : "active";
					remote.receipt = { grantBytes, state, receiptId: protocolDigest(JSON.stringify({ grantBytes, state })) };
					if (revoke && remote.loseRevoke) throw new Error("response_lost");
				}
				if (!remote.receipt) return new Response(null, { status: 404 });
				return Response.json(remote.corrupt ? { ...remote.receipt, receiptId: "f".repeat(64) } : remote.receipt);
			},
		},
	};
	const reopen = () => new CaptureAuthority(LangflowHostControl.open({ home, evidence }), supervisor, transport);
	return { control, authority: reopen(), reopen, remote, identity, credentialPath };
}

test("capture grant persists exact bytes and prevents release until durable revocation", async () => {
	const f = await fixture();
	const block = await f.control.gate.blockDispatch({
		requestId: "capture",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	const record = await f.authority.issue({ block, boundaryReceiptId: "boundary" });
	expect(await f.reopen().issue({ block, boundaryReceiptId: "boundary" })).toEqual(record);
	expect(provisionCaptureIssuer(f.control.identity)).toBe(f.credentialPath);
	await expect(f.control.gate.reconcile(block, "seal")).rejects.toThrow("dispatch_capture_not_revoked");
	const active = await f.authority.commit(record.grantBytes, AbortSignal.timeout(1000));
	expect(active.state).toBe("active");
	f.remote.loseRevoke = true;
	await expect(f.authority.revoke(record.grantBytes, AbortSignal.timeout(1000))).rejects.toThrow(
		"capture_receipt_unknown",
	);
	const restarted = f.reopen();
	expect(restarted.read(JSON.parse(record.grantBytes).id)?.phase).toBe("revoking");
	await expect(f.control.gate.reconcile(block, "seal")).rejects.toThrow("dispatch_capture_not_revoked");
	expect((await restarted.lookup(record.grantBytes, AbortSignal.timeout(1000))).state).toBe("revoked");
	await expect(restarted.commit(record.grantBytes, AbortSignal.timeout(1000))).rejects.toThrow("capture_grant_revoked");
	await f.control.gate.reconcile(block, "seal");
	expect(f.control.gate.read().block).toBeNull();
});

test("capture issuance refuses pending effects and changed boundaries or engine instances", async () => {
	const f = await fixture();
	f.control.gate.acquire({
		effectId: "pending",
		kind: "admission",
		executionId: null,
		attemptId: null,
		jobId: null,
		requestId: "pending",
		payloadDigest: "a".repeat(64),
	});
	const blocked = f.control.gate.closeDispatch({
		requestId: "capture",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	await expect(f.authority.issue({ block: blocked, boundaryReceiptId: "boundary" })).rejects.toThrow(
		"dispatch_effects_pending",
	);
	const other = await fixture();
	const block = await other.control.gate.blockDispatch({
		requestId: "capture",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	const grant = await other.authority.issue({ block, boundaryReceiptId: "boundary" });
	await expect(other.authority.issue({ block, boundaryReceiptId: "changed" })).rejects.toThrow(
		"capture_grant_conflict",
	);
	other.identity.instanceId = crypto.randomUUID();
	await expect(other.authority.commit(grant.grantBytes, AbortSignal.timeout(1000))).rejects.toThrow(
		"capture_instance_changed",
	);
	expect((await other.reopen().revoke(grant.grantBytes, AbortSignal.timeout(1000))).state).toBe("revoked");
	await other.control.gate.reconcile(block, "seal");
});

test("a corrupt engine receipt cannot settle capture authority", async () => {
	const f = await fixture();
	const block = await f.control.gate.blockDispatch({
		requestId: "capture",
		reason: { kind: "capture", snapshotId: "snapshot" },
	});
	const grant = await f.authority.issue({ block, boundaryReceiptId: "boundary" });
	f.remote.corrupt = true;
	await expect(f.authority.commit(grant.grantBytes, AbortSignal.timeout(1000))).rejects.toThrow(
		"capture_receipt_mismatch",
	);
	expect(f.reopen().read(JSON.parse(grant.grantBytes).id)?.phase).toBe("issued");
	await expect(f.control.gate.reconcile(block, "seal")).rejects.toThrow("dispatch_capture_not_revoked");
});
