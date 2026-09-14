import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBundleManifest } from "../resourceBundle/resourceBundle.ts";
import { pinResources } from "./pinnedResources.ts";

test("concurrent pins keep relative links and retain earlier versions", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-pin-"));
	const source = join(directory, "app");
	const home = join(directory, "home");
	try {
		await mkdir(source);
		await writeFile(join(source, "dependency"), "original");
		await symlink("dependency", join(source, "link"));
		await writeBundleManifest(source, "1", 4);
		const [a, b] = await Promise.all([pinResources(source, home), pinResources(source, home)]);
		expect(a.root).toBe(b.root);
		expect(await readlink(join(a.root, "link"))).toBe("dependency");
		await writeFile(join(source, "dependency"), "replacement");
		await writeBundleManifest(source, "2", 4);
		const replacement = await pinResources(source, home);
		await rm(source, { recursive: true });
		expect(await readFile(join(a.root, "link"), "utf8")).toBe("original");
		expect(await readFile(join(replacement.root, "link"), "utf8")).toBe("replacement");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a changed package cannot reuse its recorded release hash", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-pin-change-"));
	try {
		const source = join(directory, "app");
		await mkdir(source);
		await writeFile(join(source, "dependency"), "original");
		await writeBundleManifest(source, "1", 4);
		await writeFile(join(source, "dependency"), "altered");
		await expect(pinResources(source, join(directory, "home"))).rejects.toThrow("hash");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
