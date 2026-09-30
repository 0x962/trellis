import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type HomeLock, lockHome } from "../../homeLock";
import { LangflowHostControl, readRestoredEngineStartup } from "../../langflowHost";
import { ReceiptObjectStore } from "../../langflowHost/objectStore";
import { bootstrapFixture } from "../fixtures";
import { composeLangflowBootstrap } from "./compose";

const roots: string[] = [];
const locks: HomeLock[] = [];
afterEach(async () => {
	for (const lock of locks.splice(0)) lock.release();
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function restoredFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-restored-bootstrap-")));
	roots.push(root);
	const home = join(root, "home");
	const directory = join(root, "envelope");
	await mkdir(home, { mode: 0o700 });
	await mkdir(directory, { mode: 0o700 });
	const initialized = LangflowHostControl.initialize({
		home,
		initialBlock: {
			requestId: crypto.randomUUID(),
			reason: {
				kind: "restore",
				directory,
				snapshotId: crypto.randomUUID(),
				sourceDataHomeId: crypto.randomUUID(),
				manifestDigest: "a".repeat(64),
			},
		},
	});
	const f = bootstrapFixture();
	Object.assign(f.identity, initialized.identity);
	f.config.home = home;
	f.configuration.expectedHostId = f.identity.hostId;
	f.configuration.expectedDataHomeId = f.identity.dataHomeId;
	f.configuration.runtime.data.dataHomeId = f.identity.dataHomeId;
	f.configuration.runtime.epochOwnership.dataHomeId = f.identity.dataHomeId;
	f.manifest.data.dataHomeId = f.identity.dataHomeId;
	f.manifest.epochOwnership.dataHomeId = f.identity.dataHomeId;
	f.dependencies.readIdentity = LangflowHostControl.readIdentity;
	const homeLock = lockHome(home, "server", null);
	locks.push(homeLock);
	f.dependencies.restoredStartup = (input) =>
		readRestoredEngineStartup({ ...input, homeLock, signal: new AbortController().signal });
	return { ...f, root, home, homeLock };
}

test("a restored home without a configured receipt refuses before import or provisioning", async () => {
	const f = await restoredFixture();
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("restored_startup_receipt_required");
	expect(f.calls).not.toContain("import");
	expect(f.calls).not.toContain("supervisor");
	expect(existsSync(join(f.home, "langflow"))).toBe(false);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("an absent installation binding refuses before bootstrap creates runtime storage", async () => {
	const f = await restoredFixture();
	f.configuration.restoredEngineReceiptId = "b".repeat(64);
	new ReceiptObjectStore(join(LangflowHostControl.directory(f.home), "restored-engine"));
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toMatchObject({ code: "ENOENT" });
	expect(f.calls).not.toContain("import");
	expect(f.calls).not.toContain("driver");
	expect(existsSync(join(f.home, "langflow"))).toBe(false);
});

test("the actual lock must belong to the restored home", async () => {
	const f = await restoredFixture();
	const foreign = lockHome(join(f.root, "foreign"), "server", null);
	locks.push(foreign);
	f.configuration.restoredEngineReceiptId = "b".repeat(64);
	f.dependencies.restoredStartup = (input) =>
		readRestoredEngineStartup({ ...input, homeLock: foreign, signal: new AbortController().signal });
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("home_lock_not_held");
	expect(f.calls).not.toContain("import");
	expect(existsSync(join(f.home, "langflow"))).toBe(false);
});

test("an unconfigured restored home remains inactive", async () => {
	const f = await restoredFixture();
	delete f.config.langflowConfigFile;
	expect(await composeLangflowBootstrap(f.config, f.dependencies)).toBeUndefined();
	expect(f.calls).toEqual([]);
	expect(existsSync(join(f.home, "langflow"))).toBe(false);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});
