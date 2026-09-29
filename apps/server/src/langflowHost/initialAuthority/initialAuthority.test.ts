import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LiveOwnership } from "../contracts";
import { LangflowHostControl } from "../hostControl";
import { DispatchReceiptArchive } from "../receiptArchive";
import { InitialAuthorityIssuer } from "./initialAuthority";
import type { InitialAuthorityInput } from "./schema/schema";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-initial-authority-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	const control = LangflowHostControl.create({
		home,
		evidence: {
			async readTerminal() {
				throw new Error("terminal_unavailable");
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
					nativeAttemptsReceiptId: "native",
					stopObligationsReceiptId: "stops",
					snapshotSealReceiptId: null,
				});
			},
		},
	});
	const initial = control.gate.read().block;
	if (!initial) throw new Error("initial_block_missing");
	await control.gate.reconcile(initial, "verified");
	const permit = control.gate.acquire({
		effectId: "admission:e",
		kind: "admission",
		executionId: "e",
		attemptId: null,
		jobId: null,
		requestId: "request",
		payloadDigest: "b".repeat(64),
	});
	const observation: LiveOwnership = {
		id: crypto.randomUUID(),
		observedAt: "2026-09-29T20:00:00.000Z",
		endpoint: "http://127.0.0.1:7860",
		identity: {
			dataHomeId: control.identity.dataHomeId,
			hostId: control.identity.hostId,
			ownerId: crypto.randomUUID(),
			instanceId: crypto.randomUUID(),
			manifestDigest: "c".repeat(64),
		},
	};
	const supervisor = {
		async withHealthyEngine<T>(operation: (value: LiveOwnership) => Promise<T>) {
			return operation(structuredClone(observation));
		},
	};
	const input: InitialAuthorityInput = {
		executionId: "e",
		hostId: control.identity.hostId,
		projectId: "p",
		publicationId: "publication",
		publicationDigest: "d".repeat(64),
		submissionDigest: "b".repeat(64),
		correlation: {
			version: 1,
			hostId: control.identity.hostId,
			executionId: "e",
			publicationId: "publication",
			submissionDigest: "b".repeat(64),
			engineJobId: crypto.randomUUID(),
			engineSessionId: "session",
			recordedAt: "2026-09-29T19:59:59.000Z",
		},
		expiresAt: "2026-09-29T21:00:00.000Z",
		permissions: ["native.reserve", "completion.deliver"],
		permit,
	};
	const archive = DispatchReceiptArchive.open(control);
	const issuer = new InitialAuthorityIssuer(control, supervisor, archive);
	return { control, archive, issuer, input, observation, supervisor };
}

test("initial issuance retains one original grant and pending permit across restart", async () => {
	const f = await fixture();
	const first = await f.issuer.issue(f.input);
	const restarted = new InitialAuthorityIssuer(f.control, f.supervisor, DispatchReceiptArchive.open(f.control));
	const replay = await restarted.issue(f.input);
	expect(replay).toEqual(first);
	expect(first.authority.engineEpoch).toBe(1);
	expect(first.authority.ownershipRevision).toBe(1);
	expect(first.authority.ownerId).toBe(f.observation.identity.ownerId);
	expect(restarted.readAuthorityBytes(first.authority)).toBe(first.authorityBytes);
	expect(restarted.readInitial("e")?.authorityBytes).toBe(first.authorityBytes);
	expect(f.control.gate.recoverPermit(f.input.permit.binding)?.terminal).toBeNull();
	const block = f.control.gate.closeDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "s" } });
	expect(restarted.readAuthorityBytes(first.authority)).toBe(first.authorityBytes);
	expect(f.control.gate.read().block).toEqual(block);
});

test("a changed job or owner cannot replace an initial grant", async () => {
	const f = await fixture();
	const first = await f.issuer.issue(f.input);
	await expect(
		f.issuer.issue({ ...f.input, correlation: { ...f.input.correlation, engineJobId: crypto.randomUUID() } }),
	).rejects.toThrow("initial_authority_request_conflict");
	f.observation.identity.ownerId = crypto.randomUUID();
	await expect(f.issuer.issue(f.input)).rejects.toThrow("initial_authority_owner_changed");
	expect(f.issuer.readAuthorityBytes(first.authority)).toBe(first.authorityBytes);
});

test("initial issuance requires matching correlation and a retained permit", async () => {
	const f = await fixture();
	await expect(
		f.issuer.issue({ ...f.input, correlation: { ...f.input.correlation, submissionDigest: "f".repeat(64) } }),
	).rejects.toThrow("initial_authority_scope_conflict");
	await expect(f.issuer.issue({ ...f.input, permit: { ...f.input.permit, id: crypto.randomUUID() } })).rejects.toThrow(
		"initial_authority_permit_conflict",
	);
	expect(f.control.gate.recoverPermit(f.input.permit.binding)?.terminal).toBeNull();
});
