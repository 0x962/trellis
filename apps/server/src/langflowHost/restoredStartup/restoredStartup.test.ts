import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertHomeLock, lockHome, withHomeLock } from "../../homeLock";
import { protocolDigest } from "../../langflowContracts";
import { DispatchStore } from "../dispatchGate/store/store";
import { supervisorFixture } from "../fixtures/supervisorFixture";
import { LangflowHostControl } from "../hostControl";
import { provisionStorage } from "../ociDriver/storage/storage";
import { ReceiptObjectStore } from "../objectStore";
import { LangflowSupervisor } from "../supervisor";
import { restoredStartupFixture } from "./fixtures/restoredStartupFixture";
import { readRestoredEngineStartup } from "./readRestoredEngineStartup";
import { assertRestoredStartScope, type RestoredStartScope, withRestoredEngineStart } from "./withRestoredEngineStart";

function request(f: Awaited<ReturnType<typeof restoredStartupFixture>>) {
	return { home: f.home, receiptId: f.installed.receiptId, qualification: f.qualification, homeLock: f.homeLock, signal: f.signal };
}
async function open(f: Awaited<ReturnType<typeof restoredStartupFixture>>, beforeStart?: () => Promise<void>) {
	const native = await supervisorFixture();
	const dependencies = native.dependencies;
	const start = dependencies.driver.start;
	dependencies.driver.withRestoredStart = (input, operation) => withRestoredEngineStart({ ...input,
		privateRoot: join(f.home, "langflow"), imageConfigDigest: f.qualified.candidate.engine.imageConfigDigest, run: f.run }, operation);
	dependencies.driver.start = async (input) => {
		if (!input.restoredStartup) throw new Error("fixture_scope_missing");
		assertRestoredStartScope(input.restoredStartup, { identity: input.identity, privateRoot: join(f.home, "langflow"),
			imageConfigDigest: f.qualified.candidate.engine.imageConfigDigest, manifest: f.qualified.manifest });
		await beforeStart?.();
		return start(input);
	};
	const supervisor = await LangflowSupervisor.open({ home: f.home, hostId: f.control.identity.hostId,
		manifest: f.qualified.manifest, dependencies, restoredStartup: readRestoredEngineStartup(request(f)) });
	return { supervisor, native };
}

test("home ownership refuses forged, foreign, released, and borrowed release handles", async () => {
	const f = await restoredStartupFixture();
	try {
		expect(() => assertHomeLock({ setPort() {}, release() {} }, f.home)).toThrow("home_lock_not_held");
		expect(() => assertHomeLock(f.homeLock, f.root)).toThrow("home_lock_not_held");
		await withHomeLock(f.homeLock, f.home, async () => {
			expect(() => f.homeLock.release()).toThrow("home_lock_in_use");
		});
		const separate = lockHome(join(f.root, "other"), "server", null);
		separate.release();
		expect(() => assertHomeLock(separate, join(f.root, "other"))).toThrow("home_lock_not_held");
	} finally { await f.remove(); }
});

test("a restore block requires the actual retained receipt", async () => {
	const f = await restoredStartupFixture();
	try {
		expect(() => readRestoredEngineStartup({ ...request(f), receiptId: null })).toThrow("receipt_required");
		expect(() => readRestoredEngineStartup({ ...request(f), receiptId: "0".repeat(64) })).toThrow("receipt_conflict");
		const path = join(LangflowHostControl.directory(f.home), "restored-engine", `${f.installed.receiptId}.json`);
		await writeFile(path, `${f.installed.sourceBytes} `);
		expect(() => readRestoredEngineStartup(request(f))).toThrow("digest_mismatch");
	} finally { await f.remove(); }
});

test("omission of the restored startup scope refuses before process reservation", async () => {
	const f = await restoredStartupFixture();
	const native = await supervisorFixture();
	const supervisor = await LangflowSupervisor.open({ home: f.home, hostId: f.control.identity.hostId,
		manifest: f.qualified.manifest, dependencies: native.dependencies });
	try {
		await expect(supervisor.start()).rejects.toThrow("receipt_required");
		expect(existsSync(join(f.home, "langflow/supervisor/process.json"))).toBe(false);
		expect(native.trace).not.toContain("start");
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("a driver cannot replace the verified scope with an empty callback", async () => {
	const f = await restoredStartupFixture();
	const { supervisor, native } = await open(f);
	native.dependencies.driver.withRestoredStart = async (_input, operation) => operation({} as RestoredStartScope);
	try {
		await expect(supervisor.start()).rejects.toThrow("scope_unavailable");
		expect(existsSync(join(f.home, "langflow/supervisor/process.json"))).toBe(false);
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("changed engine bytes refuse before reserve and before the driver effect", async () => {
	const f = await restoredStartupFixture();
	const { supervisor, native } = await open(f);
	try {
		const secret = join(f.volumePaths.secrets, "engine-secret");
		await chmod(secret, 0o600); await writeFile(secret, "changed"); await chmod(secret, 0o400);
		await expect(supervisor.start()).rejects.toThrow("helper_failed");
		expect(existsSync(join(f.home, "langflow/supervisor/process.json"))).toBe(false);
		expect(native.trace).not.toContain("start");
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("foreign volume labels refuse before reserve", async () => {
	const f = await restoredStartupFixture();
	const { supervisor, native } = await open(f);
	try {
		const volume = f.volumes.values().next().value!;
		volume.Labels = { foreign: "home" };
		await expect(supervisor.start()).rejects.toThrow("volume_identity_conflict");
		expect(existsSync(join(f.home, "langflow/supervisor/process.json"))).toBe(false);
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("a different driver image refuses before process reservation", async () => {
	const f = await restoredStartupFixture();
	const { supervisor, native } = await open(f);
	native.dependencies.driver.withRestoredStart = (input, operation) => withRestoredEngineStart({ ...input,
		privateRoot: join(f.home, "langflow"), imageConfigDigest: `sha256:${"0".repeat(64)}`, run: f.run }, operation);
	try {
		await expect(supervisor.start()).rejects.toThrow("installation_conflict");
		expect(existsSync(join(f.home, "langflow/supervisor/process.json"))).toBe(false);
		expect(native.trace).not.toContain("start");
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("real home and supervisor exclusion span verification through the initial association", async () => {
	const f = await restoredStartupFixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const { supervisor, native } = await open(f, async () => { entered.resolve(); await release.promise; });
	let retainedScope: RestoredStartScope | undefined;
	const start = native.dependencies.driver.start;
	native.dependencies.driver.start = async (input) => {
		retainedScope = input.restoredStartup;
		return start(input);
	};
	const starting = supervisor.start();
	try {
		await entered.promise;
		expect(() => f.homeLock.release()).toThrow("home_lock_in_use");
		expect(() => lockHome(join(f.home, "langflow/supervisor"), "server", null)).toThrow();
		const store = new DispatchStore(join(LangflowHostControl.directory(f.home), "dispatch"), f.input.dataHomeId);
		expect(() => store.mutate(() => null)).toThrow();
		await expect(supervisor.shutdown()).rejects.toThrow("supervisor_busy");
		release.resolve();
		const live = await starting;
		expect(() => assertRestoredStartScope(retainedScope!, { identity: live.identity,
			privateRoot: join(f.home, "langflow"), imageConfigDigest: f.qualified.candidate.engine.imageConfigDigest,
			manifest: f.qualified.manifest })).toThrow("scope_unavailable");
		const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(f.home), "restored-engine"));
		const receipt = JSON.parse(objects.read(objects.readBinding("initial-start")));
		expect(receipt.observation.identity).toEqual(live.identity);
		const association = JSON.parse(objects.read(receipt.associationId));
		expect(association.installationReceiptId).toBe(f.installed.receiptId);
		expect(association.beforeStart).toEqual(f.installed.record.destination);
		expect(await readFile(join(f.volumePaths.secrets, "engine-secret"), "utf8")).toBe("fixture-captured-secret");
		expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
		await supervisor.shutdown();
		const released = lockHome(join(f.home, "langflow/supervisor"), "server", null); released.release();
	} finally { release.resolve(); await starting.catch(() => undefined); await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("a failed initial attempt retains its association and releases borrowed locks", async () => {
	const f = await restoredStartupFixture();
	const { supervisor, native } = await open(f, async () => { throw new Error("fixture_unknown_start"); });
	try {
		await expect(supervisor.start()).rejects.toThrow("fixture_unknown_start");
		const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(f.home), "restored-engine"));
		expect(objects.findBinding("initial-start-intent")).not.toBeNull();
		expect(objects.findBinding("initial-start")).toBeNull();
		assertHomeLock(f.homeLock, f.home);
		expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
	} finally { await supervisor.shutdown(); await native.remove(); await f.remove(); }
});

test("restored provisioning checks the exact secret before credential writes and never generates one", async () => {
	let command: string[] = [];
	await provisionStorage(async (args) => { command = args; return { exitCode: 0, stdout: "", stderr: "" }; }, {
		image: `sha256:${"a".repeat(64)}`, authenticationFile: "/fixture/auth", captureIssuerFile: "/fixture/capture",
		engineApiConfigFile: null, nativeReservationAuthenticationFile: "/fixture/native", storage: { data: "data", secrets: "secrets" },
		preservedSecret: { sha256: protocolDigest("captured"), size: 8 },
	});
	const script = command.at(-1)!;
	expect(script.indexOf("restored_secret_bytes_changed")).toBeLessThan(script.indexOf("install -d"));
	expect(script).not.toContain("token_urlsafe");
	expect(script).not.toContain("chmod 0400");
	expect(script.split("restored_secret_bytes_changed")).toHaveLength(3);
});
