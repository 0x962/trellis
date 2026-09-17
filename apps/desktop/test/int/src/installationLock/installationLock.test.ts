import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withInstallationLock } from "../../../../src/installationLock/installationLock.ts";

test("concurrent publication fails before its callback and a completed publisher releases the lock", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-install-lock-"));
	const lock = join(root, "install.lock");
	try {
		let concurrentPublished = false;
		await withInstallationLock(lock, async () => {
			await expect(
				withInstallationLock(lock, async () => {
					concurrentPublished = true;
				}),
			).rejects.toThrow("Another Trellis installation is in progress");
		});
		expect(concurrentPublished).toBe(false);
		await expect(withInstallationLock(lock, async () => "published")).resolves.toBe("published");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a rejected publisher releases the lock", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-rejected-install-lock-"));
	const lock = join(root, "install.lock");
	try {
		await expect(
			withInstallationLock(lock, async () => {
				throw new Error("Installed source changed");
			}),
		).rejects.toThrow("Installed source changed");
		await expect(withInstallationLock(lock, async () => "published")).resolves.toBe("published");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
