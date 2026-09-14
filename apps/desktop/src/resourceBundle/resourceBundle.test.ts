import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBundleManifest } from "./resourceBundle.ts";

test("the release hash covers dependency bytes and protocol", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-bundle-hash-"));
	try {
		await mkdir(join(root, "modules"));
		await writeFile(join(root, "modules/native.node"), "first build");
		const first = await writeBundleManifest(root, "1", 4);
		expect((await writeBundleManifest(root, "1", 4)).id).toBe(first.id);
		await writeFile(join(root, "modules/native.node"), "second build");
		const second = await writeBundleManifest(root, "1", 4);
		expect(second.id).not.toBe(first.id);
		expect((await writeBundleManifest(root, "1", 5)).id).not.toBe(second.id);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the release rejects links outside its closure", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-bundle-links-"));
	try {
		await symlink("/bin/sh", join(root, "external"));
		await expect(writeBundleManifest(root, "1", 4)).rejects.toThrow("outside");
		await rm(join(root, "external"));
		await symlink("../outside", join(root, "escape"));
		await expect(writeBundleManifest(root, "1", 4)).rejects.toThrow("outside");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
