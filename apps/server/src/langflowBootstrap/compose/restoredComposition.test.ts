import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lockHome } from "../../homeLock";
import type { OwnerRevocation } from "../../langflowHost";
import { DispatchStore } from "../../langflowHost/dispatchGate/store/store";
import { LangflowHostControl } from "../../langflowHost/hostControl";
import { restoredCompositionFixture } from "./components/restoredCompositionFixture";
import { composeLangflowBootstrap } from "./compose";

test("composition forwards the exact installation and qualification under the actual home lock", async () => {
	const f = await restoredCompositionFixture();
	try {
		const open = f.dependencies.openSupervisor;
		f.dependencies.openSupervisor = async (input) => {
			expect(input.restoredStartup?.receiptId).toBe(f.installed.installed.receiptId);
			expect(input.restoredStartup?.homeLock).toBe(f.installed.homeLock);
			expect(input.restoredStartup?.input.block).toEqual(f.installed.input.block);
			expect(input.restoredStartup?.input.qualification).toEqual(f.installed.qualification);
			return open(input);
		};
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const driver = f.dependencies.driver;
		const revocations = new Map<string, OwnerRevocation>();
		const authority = f.dependencies.authority(f.identity);
		f.dependencies.authority = () => ({
			...authority,
			revokeOwner: async ({ identity, observationId }) => {
				const receipt = { id: crypto.randomUUID(), identity, observationId };
				revocations.set(identity.ownerId, receipt);
				return receipt;
			},
			readRevocation: async ({ ownerId }) => revocations.get(ownerId) ?? null,
		});
		let running = false;
		const secretPath = join(f.installed.volumePaths.secrets, "engine-secret");
		const originalSecret = await readFile(secretPath);
		f.dependencies.driver = (options) => ({
			...driver(options),
			start: async () => {
				entered.resolve();
				expect(existsSync(join(f.installed.home, "langflow/supervisor/process.json"))).toBe(true);
				expect(() => f.installed.homeLock.release()).toThrow("home_lock_in_use");
				expect(() => lockHome(f.installed.home, "restore", null)).toThrow();
				expect(() =>
					lockHome(join(f.installed.home, "langflow/supervisor"), "restore", null),
				).toThrow();
				const store = new DispatchStore(
					join(LangflowHostControl.directory(f.installed.home), "dispatch"),
					f.identity.dataHomeId,
				);
				expect(() => store.mutate(() => undefined)).toThrow();
				expect(await readFile(secretPath)).toEqual(originalSecret);
				await finish.promise;
				running = true;
			},
			observe: async ({ identity, challenge }) => ({
				identity,
				challenge,
				state: running ? "running" : "exited",
				health: running ? "healthy" : "unknown",
				endpoint: running ? f.configuration.editorOrigin : null,
			}),
			stop: async () => {
				running = false;
			},
		});
		const work = composeLangflowBootstrap(f.config, f.dependencies);
		try {
			await Promise.race([
				entered.promise,
				work.then(() => {
					throw new Error("start_did_not_wait");
				}),
			]);
			expect(() => f.installed.homeLock.release()).toThrow("home_lock_in_use");
		} finally {
			finish.resolve();
			await work;
		}
		const composed = await work;
		expect(composed?.live.identity.hostId).toBe(f.identity.hostId);
		expect(await readFile(secretPath)).toEqual(originalSecret);
		expect(LangflowHostControl.recovery(f.installed.home).state).toBe("blocked");
	} finally {
		await f.remove();
	}
});

test("changed restored secret refuses before reservation or driver start", async () => {
	const f = await restoredCompositionFixture();
	try {
		const secretPath = join(f.installed.volumePaths.secrets, "engine-secret");
		await chmod(secretPath, 0o600);
		await writeFile(secretPath, "changed-captured-secret");
		await chmod(secretPath, 0o400);
		let started = false;
		const driver = f.dependencies.driver;
		f.dependencies.driver = (options) => ({
			...driver(options),
			start: async () => {
				started = true;
			},
		});
		await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("restored_engine_helper_failed");
		expect(started).toBe(false);
		expect(existsSync(join(f.installed.home, "langflow/supervisor/process.json"))).toBe(false);
		expect(LangflowHostControl.recovery(f.installed.home).state).toBe("blocked");
	} finally {
		await f.remove();
	}
});

test("a different installation pointer cannot reach image import", async () => {
	const f = await restoredCompositionFixture();
	try {
		f.configuration.restoredEngineReceiptId = "f".repeat(64);
		let imported = false;
		f.dependencies.importImage = async () => {
			imported = true;
			return { imageConfigDigest: "unexpected" };
		};
		await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow(
			"restored_engine_receipt_conflict",
		);
		expect(imported).toBe(false);
		expect(existsSync(join(f.installed.home, "langflow/supervisor/process.json"))).toBe(false);
	} finally {
		await f.remove();
	}
});
