import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryAuthorityV1Schema } from "../../../langflowContracts";
import fixture from "../../../langflowContracts/fixtures/authority.json";
import { authorityPermitBinding } from "../../authorityPermit";
import type { LiveOwnership } from "../../contracts";
import type { HostControlIdentity } from "../../hostControl";
import { AuthorityIntentStore } from "./intentStore";

const roots: string[] = [];
afterEach(() => {
	for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
function context() {
	const root = mkdtempSync(join(tmpdir(), "trellis-authority-intents-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	mkdirSync(`${home}.langflow-authority`, { mode: 0o700 });
	const authority = DeliveryAuthorityV1Schema.parse(fixture);
	const identity: HostControlIdentity = { version: 1, home, hostId: authority.hostId, dataHomeId: crypto.randomUUID() };
	const observation: LiveOwnership = {
		id: crypto.randomUUID(),
		identity: { ...identity, ownerId: authority.ownerId, instanceId: crypto.randomUUID(), manifestDigest: "a".repeat(64) },
		observedAt: "2026-09-29T12:00:00.000Z",
		endpoint: "http://127.0.0.1:7860",
	};
	return { authority, identity, observation };
}

test("a crash before acquisition preserves the exact request and expiry", () => {
	const f = context();
	const bytes = `${JSON.stringify(f.authority, null, 2)}\n`;
	const first = new AuthorityIntentStore(f.identity).prepare(bytes, f.observation, { durationMs: 60000, renewBeforeMs: 10000 });
	const reopened = new AuthorityIntentStore(f.identity);
	const replay = reopened.prepare(bytes, { ...f.observation, observedAt: "2026-09-29T12:01:00.000Z" }, { durationMs: 60000, renewBeforeMs: 10000 });
	expect(replay).toEqual(first);
	expect(replay.intent.expiresAt).toBe("2026-09-29T12:01:00.000Z");
	expect(replay.priorAuthorityBytes).toBe(bytes);
	expect(reopened.recover(authorityPermitBinding(first.intent, f.authority.engineJobId))).toEqual(first);
});

test("an uncommitted plan cannot silently move to another owner", () => {
	const f = context();
	const store = new AuthorityIntentStore(f.identity);
	const bytes = JSON.stringify(f.authority);
	store.prepare(bytes, f.observation, { durationMs: 60000, renewBeforeMs: 10000 });
	expect(() => store.prepare(bytes, { ...f.observation, identity: { ...f.observation.identity, ownerId: crypto.randomUUID() } }, { durationMs: 60000, renewBeforeMs: 10000 })).toThrow("authority_intent_owner_changed");
});
