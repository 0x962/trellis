import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { chooseHostRelease, readUpdateStatus, recordActiveRelease } from "./updateStatus.ts";

test("an incompatible live runtime retains the pinned host until local work stops", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-update-"));
	const home = join(directory, "outside", "host");
	await mkdir(home, { recursive: true });
	const release = async (id: string, protocol: number): Promise<PinnedRelease> => {
		const manifest = { id: id.repeat(64), version: id, protocol };
		const root = join(directory, "releases", manifest.id);
		await mkdir(root, { recursive: true });
		await writeFile(join(root, "release.json"), JSON.stringify(manifest));
		return { root, manifest };
	};
	try {
		const old = await release("a", 4);
		const next = await release("b", 5);
		await recordActiveRelease(home, old);
		await mkdir(join(home, "runtime"));
		await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 4 }));
		expect((await readUpdateStatus(home, next)).state).toBe("blocked");
		expect((await chooseHostRelease(home, next)).root).toBe(old.root);
		await rm(join(home, "runtime/manifest.json"));
		expect((await readUpdateStatus(home, next)).state).toBe("restart-required");
		expect((await chooseHostRelease(home, next)).root).toBe(next.root);
		await recordActiveRelease(home, next);
		expect((await readUpdateStatus(home, next)).state).toBe("current");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("an unknown execution service blocks activation without an older host", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-update-unknown-"));
	const home = join(directory, "outside", "host");
	try {
		await mkdir(join(home, "runtime"), { recursive: true });
		await writeFile(join(home, "runtime/runtime.sock"), "");
		const available = {
			root: join(directory, "releases", "a".repeat(64)),
			manifest: { id: "a".repeat(64), version: "2", protocol: 5 },
		};
		const status = await readUpdateStatus(home, available);
		expect(status.state).toBe("blocked");
		expect(status.detail).toContain("unknown");
		await expect(chooseHostRelease(home, available)).rejects.toThrow("Stop local work");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a copied home uses the available release unless an incompatible runtime needs its missing cache", async () => {
	const directory = await mkdtemp("/tmp/trl-update-copy-");
	const home = join(directory, "copied-home");
	const available = {
		root: join(directory, "desktop/releases", "b".repeat(64)),
		manifest: { id: "b".repeat(64), version: "2", protocol: 5 },
	};
	try {
		await mkdir(home);
		await writeFile(join(home, "desktop-active-release.json"), JSON.stringify({ id: "a".repeat(64) }));
		expect((await chooseHostRelease(home, available)).root).toBe(available.root);
		await mkdir(join(home, "runtime"));
		await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 4 }));
		await expect(chooseHostRelease(home, available)).rejects.toThrow("Restore the previous app");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
